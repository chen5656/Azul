"""Level 2 — alpha-beta within the round.

Once the displays are dealt, the rest of the round is a pure perfect-information
zero-sum game: no hidden tiles, no chance events until the next deal. So plain
minimax is exactly right here, with no information-set machinery (see
docs/plans/03-ai.md §0). The search stops at the round boundary, settles that
node precisely, and evaluates — it never guesses the next deal.
"""

from __future__ import annotations

import random
import time

from engine import Action, GameState, apply_action, legal_actions, settle_round, undo_action

from .base import Agent, AgentError
from .evaluate import DEFAULT_WEIGHTS, Weights, evaluate
from .greedy_agent import action_value

INF = float("inf")


class SearchTimeout(Exception):
    """Raised to unwind the search when the deadline passes mid-node."""


class MinimaxAgent(Agent):
    level = "minimax"

    def __init__(
        self,
        seed: int | None = None,
        depth: int = 4,
        time_budget: float = 0.45,
        weights: Weights = DEFAULT_WEIGHTS,
    ):
        super().__init__(seed)
        self.rng = random.Random(seed)
        self.depth = depth
        self.time_budget = time_budget
        self.weights = weights
        self.nodes = 0
        self.reached_depth = 0

    # ---- search ------------------------------------------------------

    def _ordered(self, state: GameState, player: int) -> list[Action]:
        """Children sorted by their one-ply value for the side to move.

        Ordering is what makes alpha-beta pay off at a branching factor of 30-80;
        it costs one greedy evaluation per child and saves whole subtrees.
        """
        actions = legal_actions(state)
        mover = state.current
        scored = [(action_value(state, a, mover, self.weights), a) for a in actions]
        scored.sort(key=lambda pair: -pair[0])
        return [a for _, a in scored]

    def _leaf(self, state: GameState, player: int) -> float:
        """Value of a round-final node: settle a copy, then evaluate."""
        scratch = state.clone()
        settle_round(scratch)
        return evaluate(scratch, player, self.weights)

    def _search(
        self, state: GameState, player: int, depth: int, alpha: float, beta: float
    ) -> float:
        if time.monotonic() > self._deadline:
            raise SearchTimeout
        self.nodes += 1

        if state.drafting_done():
            return self._leaf(state, player)
        if depth == 0:
            return evaluate(state, player, self.weights)

        maximizing = state.current == player
        best = -INF if maximizing else INF
        for action in self._ordered(state, player):
            undo = apply_action(state, action)
            try:
                value = self._search(state, player, depth - 1, alpha, beta)
            finally:
                undo_action(state, undo)
            if maximizing:
                if value > best:
                    best = value
                if best > alpha:
                    alpha = best
            else:
                if value < best:
                    best = value
                if best < beta:
                    beta = best
            if alpha >= beta:
                break
        return best

    def _root(self, state: GameState, player: int, depth: int, ordering: list[Action]):
        """One full-width root pass; returns (best actions, values in search order)."""
        alpha, best, chosen = -INF, -INF, []
        values: list[tuple[float, Action]] = []
        for action in ordering:
            undo = apply_action(state, action)
            try:
                value = self._search(state, player, depth - 1, alpha, INF)
            finally:
                undo_action(state, undo)
            values.append((value, action))
            if value > best:
                best, chosen = value, [action]
                alpha = value
            elif value == best:
                chosen.append(action)
        return chosen, values

    def choose(self, state: GameState, player: int) -> Action:
        actions = legal_actions(state)
        if not actions:
            raise AgentError("no legal action available")
        if len(actions) == 1:
            return actions[0]

        self._deadline = time.monotonic() + self.time_budget
        self.nodes = 0
        scratch = state.clone()
        ordering = self._ordered(scratch, player)
        chosen = ordering[:1]

        # Iterative deepening: every completed depth replaces the answer, and the
        # previous depth's values reorder the root for the next one.
        for depth in range(2, self.depth + 1):
            try:
                best, values = self._root(scratch, player, depth, ordering)
            except SearchTimeout:
                break
            chosen = best
            self.reached_depth = depth
            values.sort(key=lambda pair: -pair[0])
            ordering = [a for _, a in values]

        return self.rng.choice(chosen) if len(chosen) > 1 else chosen[0]
