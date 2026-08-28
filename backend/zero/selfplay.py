"""Self-play and match play — one batched driver used by both.

Throughput is the binding constraint on the whole project (~50k-100k games), and
the network call is the expensive part. So games are played **in lockstep**: G
games each advance one simulation, their G leaves are evaluated in a single
batched forward pass, and each tree backs its own result up. Batch size is G
rather than 1, which is where the 5-10x comes from — no virtual loss needed,
because two descents in the same tree never collide.

Two kinds of sample come out of a self-play game:

* **Drafting positions** — features, the root visit distribution as the policy
  target, and the final outcome as the value target.
* **Afterstate positions** — the deterministic settled position at a round
  boundary, value target only. The search evaluates exactly these as its leaves
  (`mcts.Tree._boundary_leaf`), so they must be in the training set; without
  them the value head is asked to score a distribution it has never seen.

Arena matches reuse the same loop with recording off and one evaluator per seat
(`arena.py`), so the two paths cannot drift in how a game is driven.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field, replace

import numpy as np

from engine import Action, GameState, apply_action, settle_round
from engine.constants import NUM_ACTIONS
from engine.game import settle_and_deal, start_round
from engine.rules import decide_winner
from engine.state import GAME_OVER

from .augment import apply_permutation, random_permutation
from .encode import NUM_FEATURES, encode_state
from .mcts import SearchConfig, Tree, terminal_value


@dataclass
class SelfPlayConfig:
    games_in_flight: int = 16
    temperature_moves: int = 20
    augmentations: int = 2  # extra display relabelings kept per position
    noise: bool = True  # Dirichlet at the root; off for arena play
    record: bool = True
    # Minimum KL(visits || uniform) for a position to be used as a policy
    # target. See `_policy_informativeness`.
    min_policy_kl: float = 0.5
    search: SearchConfig = field(default_factory=SearchConfig)

    def for_arena(self, simulations: int | None = None) -> "SelfPlayConfig":
        return replace(
            self,
            temperature_moves=0,
            augmentations=0,
            noise=False,
            record=False,
            search=replace(
                self.search,
                dirichlet_epsilon=0.0,
                simulations=simulations or self.search.simulations,
            ),
        )


def _policy_informativeness(pi: np.ndarray) -> float:
    """KL(visit distribution || uniform over the legal moves), in nats.

    Zero means the search spread its visits evenly and *decided nothing*, so the
    position says nothing about which move is good — only about which moves were
    legal. Training on those targets is actively harmful in Quadro: dumping a
    group onto the penalty row is legal from every source, so "uniform over the
    legal moves" is a penalty-heavy distribution, and a policy fitted to it
    learns to throw tiles away (measured: 67% of its mass on penalty dumps
    against a 33% base rate, and a collapse from 17 points a game to 0.2).

    Quadro reaches this state for a whole generation, unlike chess or Go: the
    search truncates at the round boundary, so it sees no real terminal value
    until the last round, and an untrained value head cannot separate sibling
    positions one move apart. Measured KL is 0.19 with an untrained network
    against 1.14 once the value head has trained, so the two regimes separate
    cleanly and generation 1 simply contributes value targets only.
    """
    support = pi[pi > 0]
    if support.size < 2:
        return 0.0
    return float((support * np.log(support * support.size)).sum())


@dataclass
class Sample:
    features: np.ndarray
    policy: np.ndarray  # zeros for value-only afterstate samples
    policy_weight: float
    perspective: int  # which player `features` was encoded from
    value: float = 0.0  # filled in once the game ends


@dataclass
class GameRecord:
    samples: list[Sample]
    scores: tuple[int, int]
    winner: int | None
    rounds: int
    moves: int


class _Game:
    """One game, driven one simulation at a time by the batched loop."""

    def __init__(self, seed: int, config: SelfPlayConfig, rng: np.random.Generator):
        self.config = config
        self.rng = rng
        self.state = GameState(rng=random.Random(seed))
        self.state.first_player = self.state.rng.randrange(2)
        start_round(self.state)
        self.samples: list[Sample] = []
        self.moves = 0
        self.done = False
        self.sims = 0
        self.tree = Tree(self.state, config.search, rng)

    @property
    def root_mover(self) -> int:
        """Which seat is searching right now — picks the evaluator in a match."""
        return self.tree.root.mover

    # ---- one simulation ------------------------------------------------

    def descend(self):
        return self.tree.descend()

    def backup(self, descent, logits, value: float) -> None:
        self.tree.backup(descent, logits, value)
        if self.sims == 0 and self.config.noise:
            self.tree.add_root_noise()
        self.sims += 1

    @property
    def search_finished(self) -> bool:
        return self.sims >= self.config.search.simulations

    # ---- move ----------------------------------------------------------

    def play_move(self) -> None:
        """Commit the searched move, record the sample, advance the game."""
        pi = self.tree.visit_distribution()
        mover = self.state.current
        if self.config.record:
            informative = _policy_informativeness(pi) >= self.config.min_policy_kl
            self.samples.append(
                Sample(
                    features=encode_state(self.state, mover),
                    policy=pi,
                    policy_weight=1.0 if informative else 0.0,
                    perspective=mover,
                )
            )

        apply_action(self.state, Action.from_id(self._sample_action(pi)))
        self.moves += 1

        if self.state.drafting_done():
            if self.config.record:
                self._record_afterstate()
            settle_and_deal(self.state)
            if self.state.phase == GAME_OVER:
                self.done = True
                return

        self.sims = 0
        self.tree = Tree(self.state, self.config.search, self.rng)

    def _sample_action(self, pi: np.ndarray) -> int:
        """Visit-proportional early (exploration), greedy afterwards."""
        if self.moves < self.config.temperature_moves:
            total = float(pi.sum())
            if total > 0:
                return int(self.rng.choice(NUM_ACTIONS, p=pi / total))
        return int(np.argmax(pi))

    def _record_afterstate(self) -> None:
        settled = self.state.clone()
        settle_round(settled)
        if settled.phase == GAME_OVER:
            return  # exact terminal; the search never needs a guess here
        holder = next(
            (i for i, p in enumerate(settled.players) if p.has_first_token),
            settled.first_player,
        )
        self.samples.append(
            Sample(
                features=encode_state(settled, holder),
                policy=np.zeros(NUM_ACTIONS, dtype=np.float32),
                policy_weight=0.0,
                perspective=holder,
            )
        )

    # ---- finish --------------------------------------------------------

    def finish(self) -> GameRecord:
        z = terminal_value(self.state, self.config.search)
        for sample in self.samples:
            sample.value = z if sample.perspective == 0 else -z
        scores = (self.state.players[0].score, self.state.players[1].score)
        winner, _ = decide_winner(self.state)
        return GameRecord(
            samples=self._augment(self.samples),
            scores=scores,
            winner=winner,
            rounds=self.state.round_num,
            moves=self.moves,
        )

    def _augment(self, samples: list[Sample]) -> list[Sample]:
        if self.config.augmentations <= 0:
            return samples
        out = list(samples)
        for sample in samples:
            for _ in range(self.config.augmentations):
                f, p = apply_permutation(
                    sample.features, sample.policy, random_permutation(self.rng)
                )
                out.append(
                    Sample(f, p, sample.policy_weight, sample.perspective, sample.value)
                )
        return out


def play_batch(
    evaluators,
    count: int,
    config: SelfPlayConfig | None = None,
    seed: int = 0,
    seeds: list[int] | None = None,
) -> list[GameRecord]:
    """Play `count` games, batching leaf evaluations across all of them.

    `evaluators` is one evaluator (self-play) or two indexed by seat (a match).
    `seeds` pins the deal of each game, which is what makes paired arena results
    low-variance; it defaults to a run of seeds derived from `seed`.
    """
    config = config or SelfPlayConfig()
    if not isinstance(evaluators, (list, tuple)):
        evaluators = [evaluators]
    rng = np.random.default_rng(seed)
    queue = list(seeds) if seeds is not None else [seed * 1_000_003 + i for i in range(count)]
    queue = queue[:count]
    active: list[_Game] = []
    finished: list[GameRecord] = []

    def refill() -> None:
        while queue and len(active) < config.games_in_flight:
            active.append(_Game(queue.pop(0), config, rng))

    refill()
    batch = np.zeros((max(config.games_in_flight, 1), NUM_FEATURES), dtype=np.float32)

    while active:
        # Group this step's leaves by which network must score them; with one
        # evaluator that is a single batch, with two it is one batch per side.
        pending: list[list[tuple[_Game, object]]] = [[] for _ in evaluators]
        for game in active:
            descent = game.descend()
            if descent.features is None:
                game.backup(descent, None, descent.value)
                continue
            index = 0 if len(evaluators) == 1 else game.root_mover
            pending[index].append((game, descent))

        for index, group in enumerate(pending):
            if not group:
                continue
            for row, (_, descent) in enumerate(group):
                batch[row] = descent.features
            logits, values = evaluators[index].infer(batch[: len(group)])
            for row, (game, descent) in enumerate(group):
                v = float(values[row])
                game.backup(descent, logits[row], v if descent.perspective == 0 else -v)

        still_active: list[_Game] = []
        for game in active:
            if game.search_finished:
                game.play_move()
            if game.done:
                finished.append(game.finish())
            else:
                still_active.append(game)
        active = still_active
        refill()

    return finished


def play_games(evaluator, count: int, config=None, seed: int = 0) -> list[GameRecord]:
    """Self-play convenience wrapper around `play_batch`."""
    return play_batch(evaluator, count, config, seed)
