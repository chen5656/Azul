"""Agent protocol shared by every AI level."""

from __future__ import annotations

from abc import ABC, abstractmethod

from engine import Action, GameState


class AgentError(RuntimeError):
    """Raised by an agent when it cannot produce a move."""


class Agent(ABC):
    level: str = "base"

    def __init__(self, seed: int | None = None):
        self.seed = seed

    @abstractmethod
    def choose(self, state: GameState, player: int) -> Action:
        """Pick one legal action for `player` in `state`.

        Implementations must not mutate `state`; clone it or use undo.
        """

    def __repr__(self) -> str:
        return f"{type(self).__name__}(level={self.level!r})"
