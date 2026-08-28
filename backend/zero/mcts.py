"""PUCT search with afterstate truncation at the round boundary.

The one place Quadro differs from chess/Go is the deal: at the end of a round
the displays are refilled at random. Rather than branching the tree over every
possible deal, the search **stops at the boundary**:

    ... last draft of the round -> settle_round() -> evaluate, done.

`settle_round` is fully deterministic (tiles move to the wall, rows score,
penalties apply), so that leaf is an exact position, not a sample. The refill
randomness is pushed entirely into the value head, which learns the *expected*
value of the afterstate from self-play outcomes. Consequence: every simulation
through a given line returns the same number, so the search carries no deal
noise at all — and it is why self-play must also train on afterstate positions
(see `selfplay.py`), or the value head never sees this part of the state space.

Sign convention: every stored value is from **player 0's** point of view, and
selection flips it for the side to move. Perspective bugs are the classic way an
AlphaZero implementation silently fails to learn, and an absolute frame removes
the whole class of them.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import numpy as np

from engine import (
    Action,
    GameState,
    apply_action,
    legal_actions,
    settle_round,
    undo_action,
)
from engine.constants import NUM_ACTIONS
from engine.rules import decide_winner
from engine.state import GAME_OVER

from .encode import encode_state


@dataclass
class SearchConfig:
    simulations: int = 400
    c_puct: float = 1.5
    dirichlet_alpha: float = 0.3
    dirichlet_epsilon: float = 0.25
    fpu_reduction: float = 0.25
    # Weight on the score margin in the terminal reward. Pure win/loss (+-1)
    # teaches the net to protect a lead rather than extend it, which is exactly
    # the behavior the existing MCTS level shows in docs/ai_benchmarks.md.
    margin_weight: float = 0.3
    margin_scale: float = 20.0


def terminal_value(state: GameState, config: SearchConfig) -> float:
    """Final reward from player 0's point of view, in [-1, 1]."""
    winner, draw = decide_winner(state)
    outcome = 0.0 if draw else (1.0 if winner == 0 else -1.0)
    margin = state.players[0].score - state.players[1].score
    shaped = math.tanh(margin / config.margin_scale)
    w = config.margin_weight
    return (1.0 - w) * outcome + w * shaped


class Node:
    __slots__ = ("mover", "actions", "priors", "child_n", "child_w", "children",
                 "visits", "value_sum", "is_leaf_boundary", "boundary_value")

    def __init__(self, mover: int):
        self.mover = mover
        self.actions: np.ndarray | None = None  # action ids, set on expansion
        self.priors: np.ndarray | None = None
        self.child_n: np.ndarray | None = None
        self.child_w: np.ndarray | None = None  # player-0 perspective
        self.children: dict[int, "Node"] = {}
        self.visits = 0
        self.value_sum = 0.0
        self.is_leaf_boundary = False
        self.boundary_value: float | None = None  # cached once evaluated

    @property
    def expanded(self) -> bool:
        return self.actions is not None

    def q(self, perspective: int) -> float:
        if not self.visits:
            return 0.0
        q0 = self.value_sum / self.visits
        return q0 if perspective == 0 else -q0


@dataclass
class Descent:
    """One in-flight simulation, paused while its leaf is evaluated."""

    path: list[Node]
    slots: list[int]  # index into the parent's child arrays, parallel to path[:-1]
    undos: list = field(default_factory=list)
    features: np.ndarray | None = None  # None when the leaf needs no network
    value: float | None = None  # set when the leaf value is already known
    perspective: int = 0  # whose view `features` was encoded from


class Tree:
    """A search tree rooted at one position, driven by an external evaluator.

    The caller alternates `descend()` and `backup()`, which lets many trees share
    one batched network call (`selfplay.py`), while a single-position search is
    just the same loop with a batch of one.
    """

    def __init__(self, state: GameState, config: SearchConfig, rng: np.random.Generator):
        self.state = state.clone()  # mutated during descent, always restored
        self.config = config
        self.rng = rng
        self.root = Node(self.state.current)
        self.root_noise_applied = False

    # ---- descent -----------------------------------------------------

    def descend(self) -> Descent:
        node = self.root
        path = [node]
        slots: list[int] = []
        undos: list = []

        while True:
            if not node.expanded:
                return Descent(
                    path,
                    slots,
                    undos,
                    features=encode_state(self.state, self.state.current),
                    perspective=self.state.current,
                )

            slot = self._select(node)
            action_id = int(node.actions[slot])
            undos.append(apply_action(self.state, Action.from_id(action_id)))
            child = node.children.get(action_id)
            if child is None:
                child = Node(self.state.current)
                node.children[action_id] = child
            path.append(child)
            slots.append(slot)
            node = child

            if self.state.drafting_done():
                # Round boundary: settle deterministically and stop here. The
                # settled position is exact, so its value is cached after the
                # first evaluation and every later visit is free.
                if child.boundary_value is not None:
                    return Descent(path, slots, undos, value=child.boundary_value)
                return self._boundary_leaf(path, slots, undos, child)

    def _boundary_leaf(self, path, slots, undos, node: Node) -> Descent:
        settled = self.state.clone()
        settle_round(settled)
        node.is_leaf_boundary = True
        if settled.phase == GAME_OVER:
            node.boundary_value = terminal_value(settled, self.config)
            return Descent(path, slots, undos, value=node.boundary_value)
        # Whoever holds the first token opens the next round; that is decided
        # by the settle, not by the deal, so the perspective is exact.
        holder = next(
            (i for i, p in enumerate(settled.players) if p.has_first_token),
            settled.first_player,
        )
        return Descent(
            path,
            slots,
            undos,
            features=encode_state(settled, holder),
            perspective=holder,
        )

    def _select(self, node: Node) -> int:
        n = node.child_n
        w = node.child_w
        sign = 1.0 if node.mover == 0 else -1.0
        visited = n > 0
        q = np.zeros_like(w)
        np.divide(w, np.maximum(n, 1.0), out=q)
        q *= sign
        # First-play urgency: unvisited children inherit the parent's value with
        # a small pessimistic offset, so a good prior is not swamped by optimism.
        parent_q = node.q(node.mover)
        q = np.where(visited, q, parent_q - self.config.fpu_reduction)
        u = self.config.c_puct * node.priors * math.sqrt(node.visits + 1) / (1.0 + n)
        return int(np.argmax(q + u))

    # ---- backup ------------------------------------------------------

    def backup(self, descent: Descent, priors: np.ndarray | None, value: float) -> None:
        """Finish a simulation: expand its leaf if needed, then propagate `value`.

        `value` is from player 0's point of view. `priors` is the network's raw
        180-vector of policy logits, or None for a leaf that does not expand.
        """
        leaf = descent.path[-1]
        if leaf.is_leaf_boundary:
            if leaf.boundary_value is None:
                leaf.boundary_value = value
        elif priors is not None and not leaf.expanded:
            self._expand(leaf, priors)

        for i, node in enumerate(descent.path):
            node.visits += 1
            node.value_sum += value
            if i < len(descent.slots):
                slot = descent.slots[i]
                node.child_n[slot] += 1.0
                node.child_w[slot] += value

        for undo in reversed(descent.undos):
            undo_action(self.state, undo)

    def _expand(self, node: Node, logits: np.ndarray) -> None:
        actions = legal_actions(self.state)
        ids = np.array([a.action_id for a in actions], dtype=np.int32)
        # Softmax over the legal actions only — the illegal logits are never
        # constrained by training and must not receive probability mass.
        z = logits[ids].astype(np.float64)
        z -= z.max()
        p = np.exp(z)
        p /= p.sum()
        node.actions = ids
        node.priors = p.astype(np.float32)
        node.child_n = np.zeros(len(ids), dtype=np.float32)
        node.child_w = np.zeros(len(ids), dtype=np.float32)

    # ---- root --------------------------------------------------------

    def add_root_noise(self) -> None:
        """Dirichlet exploration noise, self-play only."""
        root = self.root
        if not root.expanded or self.root_noise_applied:
            return
        eps = self.config.dirichlet_epsilon
        if eps <= 0:
            return
        noise = self.rng.dirichlet(
            np.full(len(root.priors), self.config.dirichlet_alpha)
        ).astype(np.float32)
        root.priors = (1.0 - eps) * root.priors + eps * noise
        self.root_noise_applied = True

    def visit_distribution(self) -> np.ndarray:
        """Root visit counts as a probability vector over all 180 actions."""
        pi = np.zeros(NUM_ACTIONS, dtype=np.float32)
        root = self.root
        if not root.expanded:
            return pi
        total = float(root.child_n.sum())
        if total <= 0:
            pi[root.actions] = 1.0 / len(root.actions)
            return pi
        pi[root.actions] = root.child_n / total
        return pi

    def root_value(self) -> float:
        return self.root.q(0)


def search(
    state: GameState,
    evaluator,
    config: SearchConfig,
    rng,
    noise: bool = False,
    deadline: float | None = None,
) -> Tree:
    """Run a complete single-position search. `evaluator` is `Evaluator`-shaped.

    Stops at `config.simulations` or at `deadline` (a `time.monotonic()` stamp),
    whichever comes first — the deployed agent is bound by a move clock, the
    training arena by a simulation count.
    """
    tree = Tree(state, config, rng)
    for i in range(config.simulations):
        if deadline is not None and i and time.monotonic() >= deadline:
            break
        descent = tree.descend()
        if descent.features is None:
            tree.backup(descent, None, descent.value)
            continue
        logits, value = evaluator.infer_one(descent.features)
        v0 = value if descent.perspective == 0 else -value
        tree.backup(descent, logits, v0)
        if noise and i == 0:
            tree.add_root_noise()
    return tree
