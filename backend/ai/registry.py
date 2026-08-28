"""Level name -> agent. Unimplemented levels fall back to the level below.

The protocol pins all four level names from P2 so the client never has to
change when Minimax and MCTS land in P3.
"""

from __future__ import annotations

from .base import Agent
from .random_agent import RandomAgent

LEVELS = ("random", "greedy", "minimax", "mcts")


def make_agent(level: str, seed: int | None = None) -> Agent:
    if level not in LEVELS:
        raise ValueError(f"unknown ai level: {level!r}")
    # P2 ships Level 0 only; the rest arrive in P3 (docs/plans/03-ai.md).
    return RandomAgent(seed=seed)
