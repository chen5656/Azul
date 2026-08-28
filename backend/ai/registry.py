"""Level name -> agent.

The four classic levels (docs/plans/03-ai.md) are always available. `azulzero`
(docs/plans_alphaZero) is listed too but only usable once trained weights are
installed, so anything that offers a menu should ask `available_levels()` rather
than assume the whole roster is playable.
"""

from __future__ import annotations

from .base import Agent
from .greedy_agent import GreedyAgent
from .mcts_agent import MctsAgent
from .minimax_agent import MinimaxAgent
from .random_agent import RandomAgent

CLASSIC_LEVELS = ("random", "greedy", "minimax", "mcts")
LEVELS = CLASSIC_LEVELS + ("azulzero",)


def available_levels() -> tuple[str, ...]:
    """Levels that can actually be instantiated right now."""
    from .azulzero_agent import weights_available

    return LEVELS if weights_available() else CLASSIC_LEVELS


def make_agent(level: str, seed: int | None = None) -> Agent:
    if level not in LEVELS:
        raise ValueError(f"unknown ai level: {level!r}")
    if level == "random":
        return RandomAgent(seed=seed)
    if level == "greedy":
        return GreedyAgent(seed=seed)
    if level == "minimax":
        return MinimaxAgent(seed=seed)
    if level == "mcts":
        return MctsAgent(seed=seed)
    from .azulzero_agent import AzulZeroAgent

    return AzulZeroAgent(seed=seed)
