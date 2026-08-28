"""Level 1 — one-ply search over `evaluate`. Fast, and the rollout policy for MCTS."""

from __future__ import annotations

import random

from engine import (
    Action,
    GameState,
    apply_action,
    legal_actions,
    settle_round,
    undo_action,
)

from .base import Agent, AgentError
from .evaluate import DEFAULT_WEIGHTS, Weights, evaluate


def action_value(
    state: GameState, action: Action, player: int, w: Weights = DEFAULT_WEIGHTS
) -> float:
    """Value of `state` after `action`, settling the round if the action ends it.

    `state` is restored before returning, so callers may pass their live state.

    Settling matters: without it the last draft of a round looks identical to a
    mid-round one, and the agent cannot see the penalties it is about to eat.
    """
    undo = apply_action(state, action)
    try:
        if state.drafting_done():
            # Settling is not undoable, so the round-end case pays for a clone.
            scratch = state.clone()
            settle_round(scratch)
            return evaluate(scratch, player, w)
        return evaluate(state, player, w)
    finally:
        undo_action(state, undo)


class GreedyAgent(Agent):
    level = "greedy"

    def __init__(self, seed: int | None = None, epsilon: float = 0.0,
                 weights: Weights = DEFAULT_WEIGHTS):
        super().__init__(seed)
        self.rng = random.Random(seed)
        self.epsilon = epsilon
        self.weights = weights

    def choose(self, state: GameState, player: int) -> Action:
        actions = legal_actions(state)
        if not actions:
            raise AgentError("no legal action available")
        if self.epsilon and self.rng.random() < self.epsilon:
            return self.rng.choice(actions)

        best: list[Action] = []
        best_value = float("-inf")
        for action in actions:
            value = action_value(state, action, player, self.weights)
            if value > best_value:
                best_value, best = value, [action]
            elif value == best_value:
                best.append(action)
        return self.rng.choice(best) if len(best) > 1 else best[0]
