"""The gradient-descent half of the loop. Requires PyTorch.

Loss is the AlphaZero one: value MSE plus policy cross-entropy, over the full
180-action vector. Illegal actions have target probability zero and are pushed
down like any unvisited legal action — which is exactly what keeps the raw
policy usable as a fallback in `AzulZeroAgent`. Afterstate samples carry
`policy_weight = 0` and contribute to the value term only.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
import torch.nn.functional as F

from .model import AzulZeroNet


@dataclass
class TrainConfig:
    steps: int = 1000
    batch_size: int = 512
    lr: float = 1e-3
    lr_final: float = 1e-4
    weight_decay: float = 1e-4
    value_weight: float = 1.0
    grad_clip: float = 5.0


@dataclass
class TrainStats:
    steps: int
    loss: float
    policy_loss: float
    value_loss: float
    lr: float

    def summary(self) -> str:
        return (
            f"{self.steps} steps | loss {self.loss:.4f} "
            f"(policy {self.policy_loss:.4f}, value {self.value_loss:.4f}) "
            f"| lr {self.lr:.2e}"
        )


def pick_device(preference: str = "auto") -> torch.device:
    """Prefer Apple's MPS backend, then CUDA, then CPU."""
    if preference != "auto":
        return torch.device(preference)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def train_epoch(
    net: AzulZeroNet,
    buffer,
    config: TrainConfig,
    device: torch.device,
    rng: np.random.Generator,
    optimizer: torch.optim.Optimizer | None = None,
) -> TrainStats:
    """One generation of training over the current replay window."""
    net.to(device).train()
    optimizer = optimizer or torch.optim.AdamW(
        net.parameters(), lr=config.lr, weight_decay=config.weight_decay
    )
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config.steps, eta_min=config.lr_final
    )

    totals = np.zeros(3)
    for _ in range(config.steps):
        features, policy, policy_weight, value = buffer.sample(config.batch_size, rng)
        x = torch.from_numpy(features).to(device)
        target_p = torch.from_numpy(policy).to(device)
        weight = torch.from_numpy(policy_weight).to(device)
        target_v = torch.from_numpy(value).to(device)

        logits, v = net(x)
        log_p = F.log_softmax(logits, dim=-1)
        policy_loss_per_sample = -(target_p * log_p).sum(dim=-1)
        denom = weight.sum().clamp(min=1.0)
        policy_loss = (policy_loss_per_sample * weight).sum() / denom
        value_loss = F.mse_loss(v, target_v)
        loss = policy_loss + config.value_weight * value_loss

        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(net.parameters(), config.grad_clip)
        optimizer.step()
        schedule.step()
        totals += (loss.item(), policy_loss.item(), value_loss.item())

    net.eval()
    n = max(config.steps, 1)
    return TrainStats(
        steps=config.steps,
        loss=totals[0] / n,
        policy_loss=totals[1] / n,
        value_loss=totals[2] / n,
        lr=schedule.get_last_lr()[0],
    )


class TorchEvaluator:
    """Wraps a torch module in the `infer` / `infer_one` shape the search wants."""

    def __init__(self, net: AzulZeroNet, device: torch.device | None = None):
        self.net = net.eval()
        self.device = device or torch.device("cpu")
        self.net.to(self.device)

    @torch.no_grad()
    def infer(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        t = torch.from_numpy(np.ascontiguousarray(x, dtype=np.float32)).to(self.device)
        logits, value = self.net(t)
        return logits.cpu().numpy(), value.cpu().numpy()

    def infer_one(self, features: np.ndarray) -> tuple[np.ndarray, float]:
        logits, value = self.infer(features.reshape(1, -1))
        return logits[0], float(value[0])
