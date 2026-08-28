"""Level 4 — AzulZero: PUCT search guided by a self-play-trained network.

Unlike the other levels this one has no hand-written evaluation at all. Its
strength comes entirely from the weights in `zero/weights/`, produced by
`zero.loop` (docs/plans_alphaZero/README.md).

Inference is numpy-only — the exported `.npz` is read by `zero.numpy_net`, so
serving the level does not drag PyTorch into the web process.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import numpy as np

from engine import Action, GameState, legal_actions

from .base import Agent, AgentError

WEIGHTS_DIR = Path(__file__).resolve().parents[1] / "zero" / "weights"
DEFAULT_WEIGHTS = WEIGHTS_DIR / "azulzero.npz"


class WeightsMissing(AgentError):
    """Raised when the level is requested but no trained weights are installed."""


def weights_path() -> Path:
    """Where to load from: `$AZULZERO_WEIGHTS` if set, else the bundled file."""
    override = os.environ.get("AZULZERO_WEIGHTS")
    return Path(override) if override else DEFAULT_WEIGHTS


def weights_available() -> bool:
    return weights_path().exists()


_CACHE: dict[Path, object] = {}


def load_network(path: Path | None = None):
    """Load and memoize the network. One copy per process, not per game."""
    path = path or weights_path()
    net = _CACHE.get(path)
    if net is None:
        if not path.exists():
            raise WeightsMissing(
                f"no AzulZero weights at {path}. Train with `python -m zero.loop`, "
                f"export with `python -m zero.export`, or set $AZULZERO_WEIGHTS."
            )
        from zero.numpy_net import NumpyNet

        net = NumpyNet.load(path)
        _CACHE[path] = net
    return net


class AzulZeroAgent(Agent):
    level = "azulzero"

    def __init__(
        self,
        seed: int | None = None,
        simulations: int = 800,
        time_budget: float = 0.45,
        c_puct: float = 1.5,
        weights: Path | None = None,
    ):
        super().__init__(seed)
        from zero.mcts import SearchConfig

        self.rng = np.random.default_rng(seed)
        self.time_budget = time_budget
        self.config = SearchConfig(
            simulations=simulations, c_puct=c_puct, dirichlet_epsilon=0.0
        )
        self.net = load_network(weights)
        self.simulations_used = 0

    def choose(self, state: GameState, player: int) -> Action:
        actions = legal_actions(state)
        if not actions:
            raise AgentError("no legal action available")
        if len(actions) == 1:
            return actions[0]

        from zero.mcts import search

        deadline = time.monotonic() + self.time_budget if self.time_budget else None
        tree = search(state, self.net, self.config, self.rng, noise=False, deadline=deadline)
        self.simulations_used = tree.root.visits

        root = tree.root
        if not root.expanded or root.child_n.sum() == 0:
            # Search never got off the ground (budget too tight): fall back to
            # the raw policy, which is still far better than a random move.
            logits, _ = self.net.infer_one(_encode(state, player))
            ids = [a.action_id for a in actions]
            return Action.from_id(ids[int(np.argmax(logits[ids]))])

        # Most-visited move, not highest mean: visit counts are the far less
        # noisy statistic, and they are what the policy target is built from.
        return Action.from_id(int(root.actions[int(np.argmax(root.child_n))]))


def _encode(state: GameState, player: int) -> np.ndarray:
    from zero.encode import encode_state

    return encode_state(state, player)
