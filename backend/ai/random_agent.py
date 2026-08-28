"""Level 0 — uniform random legal action. The baseline every other level beats."""

from __future__ import annotations

import random

from engine import Action, GameState, legal_actions

from .base import Agent, AgentError


class RandomAgent(Agent):
    level = "random"

    def __init__(self, seed: int | None = None):
        super().__init__(seed)
        self.rng = random.Random(seed)

    def choose(self, state: GameState, player: int) -> Action:
        actions = legal_actions(state)
        if not actions:
            raise AgentError("no legal action available")
        return self.rng.choice(actions)
