"""Level 3 — open-loop determinized UCT.

Chance only enters at a round boundary (the deal), and the bag's composition is
public — only the draw order is random. So instead of building a node per
possible deal, each simulation draws its own deal when it crosses a boundary and
the statistics for different deals aggregate on the same node (open loop). That
keeps the tree small and is why ISMCTS is not needed here (docs/plans/03-ai.md).

Because deals differ between simulations, the set of legal actions at a node
differs too; selection always intersects the node's children with the actions
that are actually legal in *this* simulation.
"""

from __future__ import annotations

import math
import random
import time

from engine import Action, GameState, apply_action, legal_actions, settle_and_deal
from engine.state import GAME_OVER

from .base import Agent, AgentError
from .evaluate import DEFAULT_WEIGHTS, Weights, evaluate
from .greedy_agent import action_value

# Evaluation units are roughly "points"; this squashes a plausible swing into
# [-1, 1] without saturating on ordinary positions.
VALUE_SCALE = 25.0


class Node:
    __slots__ = ("player", "visits", "value", "children", "candidates")

    def __init__(self, player: int):
        self.player = player  # side to move here
        self.visits = 0
        self.value = 0.0  # summed reward from the root player's view
        self.children: dict[int, Node] = {}
        self.candidates: list[int] | None = None  # action ids worth searching


class MctsAgent(Agent):
    level = "mcts"

    def __init__(
        self,
        seed: int | None = None,
        time_budget: float = 0.45,
        exploration: float = 1.2,
        tree_width: int = 12,
        rollout_epsilon: float = 0.15,
        rollout_width: int = 6,
        rollout_rounds: int = 2,
        max_simulations: int | None = None,
        weights: Weights = DEFAULT_WEIGHTS,
    ):
        super().__init__(seed)
        self.rng = random.Random(seed)
        self.time_budget = time_budget
        self.exploration = exploration
        self.rollout_rounds = rollout_rounds
        self.max_simulations = max_simulations
        self.weights = weights
        self.tree_width = tree_width
        self.rollout_epsilon = rollout_epsilon
        self.rollout_width = rollout_width
        self.simulations = 0

    # ---- one simulation ----------------------------------------------

    def _candidates(self, node: Node, state: GameState, actions: list[Action]) -> list[Action]:
        """Narrow a 30-80 move node to the moves a shallow look says are plausible.

        At a 500ms budget a full-width tree gives every root child two or three
        visits, which is noise. The shortlist is computed once per node and then
        filtered against what is legal in the current simulation, which is all
        that can change once a playout crosses a round boundary.
        """
        if node.candidates is None:
            mover = state.current
            ranked = sorted(
                actions, key=lambda a: -action_value(state, a, mover, self.weights)
            )
            node.candidates = [a.action_id for a in ranked[: self.tree_width]]
        shortlist = set(node.candidates)
        narrowed = [a for a in actions if a.action_id in shortlist]
        return narrowed or actions

    def _select(self, node: Node, actions: list[Action]) -> Action:
        """UCT over the actions legal in this simulation; unseen ones go first."""
        unseen = [a for a in actions if a.action_id not in node.children]
        if unseen:
            return self.rng.choice(unseen)
        log_n = math.log(node.visits + 1)
        best, best_score = None, -math.inf
        for action in actions:
            child = node.children[action.action_id]
            exploit = child.value / child.visits if child.visits else 0.0
            if node.player != self.root_player:
                exploit = -exploit
            score = exploit + self.exploration * math.sqrt(log_n / (child.visits + 1e-9))
            if score > best_score:
                best, best_score = action, score
        return best  # type: ignore[return-value]

    def _reward(self, state: GameState) -> float:
        """Terminal games score ±1; cut-off positions use a squashed evaluation."""
        if state.phase == GAME_OVER:
            a, b = (p.score for p in state.players)
            me = self.root_player
            mine, theirs = (a, b) if me == 0 else (b, a)
            if mine != theirs:
                return 1.0 if mine > theirs else -1.0
            rows = [p.complete_rows() for p in state.players]
            if rows[me] != rows[1 - me]:
                return 1.0 if rows[me] > rows[1 - me] else -1.0
            return 0.0
        return math.tanh(evaluate(state, self.root_player, self.weights) / VALUE_SCALE)

    def _playout(self, state: GameState, budget: int) -> float:
        """Greedy-with-noise to the end, or `budget` round boundaries, whichever first."""
        while state.phase != GAME_OVER and budget > 0:
            if state.drafting_done():
                settle_and_deal(state)
                budget -= 1
                continue
            apply_action(state, self._rollout_action(state))
        if state.phase != GAME_OVER and state.drafting_done():
            settle_and_deal(state)
        return self._reward(state)

    def _rollout_action(self, state: GameState) -> Action:
        """Greedy over a random sample of moves — full greedy costs more than the
        extra playout accuracy is worth at this budget."""
        actions = legal_actions(state)
        if self.rng.random() < self.rollout_epsilon:
            return self.rng.choice(actions)
        if len(actions) > self.rollout_width:
            actions = self.rng.sample(actions, self.rollout_width)
        mover = state.current
        return max(actions, key=lambda a: action_value(state, a, mover, self.weights))

    def _simulate(self, root: Node, state: GameState) -> None:
        node = root
        path = [root]
        rounds_left = self.rollout_rounds

        while True:
            if state.phase == GAME_OVER:
                reward = self._reward(state)
                break
            if state.drafting_done():
                if rounds_left <= 0:
                    reward = self._reward(state)
                    break
                settle_and_deal(state)
                rounds_left -= 1
                continue

            actions = self._candidates(node, state, legal_actions(state))
            expanding = any(a.action_id not in node.children for a in actions)
            action = self._select(node, actions)
            child = node.children.get(action.action_id)
            if child is None:
                child = Node(1 - state.current)
                node.children[action.action_id] = child
            apply_action(state, action)
            node = child
            path.append(child)
            if expanding:
                reward = self._playout(state, rounds_left)
                break

        for visited in path:
            visited.visits += 1
            visited.value += reward

    # ---- agent API ----------------------------------------------------

    def choose(self, state: GameState, player: int) -> Action:
        actions = legal_actions(state)
        if not actions:
            raise AgentError("no legal action available")
        if len(actions) == 1:
            return actions[0]

        self.root_player = player
        root = Node(player)
        deadline = time.monotonic() + self.time_budget
        self.simulations = 0

        while time.monotonic() < deadline:
            if self.max_simulations and self.simulations >= self.max_simulations:
                break
            scratch = state.clone()
            # Each simulation deals its own future: an independent determinization.
            scratch.rng = random.Random(self.rng.randrange(2**31))
            self._simulate(root, scratch)
            self.simulations += 1

        # Robust child: most visited, not highest mean — it is far less noisy.
        best = max(
            (a for a in actions if a.action_id in root.children),
            key=lambda a: root.children[a.action_id].visits,
            default=None,
        )
        return best if best is not None else self.rng.choice(actions)
