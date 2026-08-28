"""The policy/value network. PyTorch, training side only.

Architecture (docs/plans_alphaZero/README.md §2.2): a residual MLP, not a ResNet
over board planes — Azul's features have no spatial structure to convolve over.
~1.5M parameters at the default size, small enough that a CPU forward pass is
well under a millisecond, which is what keeps the deployed agent inside its
500ms move budget.

The forward pass returns *raw* policy logits. Masking illegal actions is the
caller's job and must happen before the softmax (`masked_policy` below); a
softmax over unmasked logits leaks probability mass onto moves that do not
exist.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import torch
import torch.nn as nn
import torch.nn.functional as F

from engine.constants import NUM_ACTIONS

from .encode import NUM_FEATURES

NEG_INF = -1e9


@dataclass(frozen=True)
class ModelConfig:
    features: int = NUM_FEATURES
    actions: int = NUM_ACTIONS
    width: int = 512
    blocks: int = 4
    value_hidden: int = 64

    def to_dict(self) -> dict:
        return asdict(self)


class ResidualBlock(nn.Module):
    def __init__(self, width: int):
        super().__init__()
        self.fc1 = nn.Linear(width, width)
        self.fc2 = nn.Linear(width, width)
        self.norm1 = nn.LayerNorm(width)
        self.norm2 = nn.LayerNorm(width)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.norm1(self.fc1(x)))
        h = self.norm2(self.fc2(h))
        return F.relu(x + h)


class AzulZeroNet(nn.Module):
    """Policy/value network.

    The two heads are initialized differently on purpose, and the asymmetry is
    load-bearing for the cold start (docs/plans_alphaZero §4.1b):

    * **Policy head: zeroed.** A random policy head hands the search arbitrary
      move preferences before it knows anything, and because dumping tiles onto
      the penalty row is legal from every source it is the one action always
      available to be over-weighted. Zeroing makes generation 1 explore with
      exactly uniform priors.
    * **Value head: left random.** It must *not* be zeroed. Truncating the search
      at the round boundary means a tree almost never reaches a real terminal
      state before the final round, so the value head is the search's only
      source of discrimination. Zeroed, every leaf returns 0, the visit counts
      come out exactly uniform over the legal moves, and the policy trains on
      which actions merely tend to be *legal* — measured collapse to 67% penalty
      dumps against a 33% base rate. Random weights give a spread of about 0.38
      across positions, which is arbitrary but position-dependent, and that is
      enough for the visit counts to say something the policy can learn from.
    """

    def __init__(self, config: ModelConfig | None = None):
        super().__init__()
        self.config = config or ModelConfig()
        c = self.config
        self.stem = nn.Sequential(
            nn.Linear(c.features, c.width), nn.LayerNorm(c.width), nn.ReLU()
        )
        self.blocks = nn.ModuleList(ResidualBlock(c.width) for _ in range(c.blocks))
        self.policy_head = nn.Sequential(
            nn.Linear(c.width, c.width), nn.ReLU(), nn.Linear(c.width, c.actions)
        )
        self.value_head = nn.Sequential(
            nn.Linear(c.width, c.value_hidden),
            nn.ReLU(),
            nn.Linear(c.value_hidden, 1),
            nn.Tanh(),
        )
        nn.init.zeros_(self.policy_head[-1].weight)
        nn.init.zeros_(self.policy_head[-1].bias)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.stem(x)
        for block in self.blocks:
            h = block(h)
        return self.policy_head(h), self.value_head(h).squeeze(-1)


def masked_policy(logits: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """Softmax over legal actions only. `mask` is 1 for legal, 0 for illegal."""
    return F.softmax(logits.masked_fill(mask <= 0, NEG_INF), dim=-1)


def save_checkpoint(path, net: AzulZeroNet, meta: dict | None = None) -> None:
    torch.save(
        {"config": net.config.to_dict(), "state_dict": net.state_dict(), "meta": meta or {}},
        path,
    )


def load_checkpoint(path, map_location="cpu") -> tuple[AzulZeroNet, dict]:
    blob = torch.load(path, map_location=map_location, weights_only=False)
    net = AzulZeroNet(ModelConfig(**blob["config"]))
    net.load_state_dict(blob["state_dict"])
    net.eval()
    return net, blob.get("meta", {})
