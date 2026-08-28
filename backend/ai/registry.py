"""Level name -> agent. All four levels of docs/plans/03-ai.md are implemented.
"""

from __future__ import annotations

from .base import Agent
from .greedy_agent import GreedyAgent
from .mcts_agent import MctsAgent
from .minimax_agent import MinimaxAgent
from .random_agent import RandomAgent

LEVELS = ("random", "greedy", "minimax", "mcts")


def make_agent(level: str, seed: int | None = None) -> Agent:
    if level not in LEVELS:
        raise ValueError(f"unknown ai level: {level!r}")
    if level == "random":
        return RandomAgent(seed=seed)
    if level == "greedy":
        return GreedyAgent(seed=seed)
    if level == "minimax":
        return MinimaxAgent(seed=seed)
    return MctsAgent(seed=seed)
