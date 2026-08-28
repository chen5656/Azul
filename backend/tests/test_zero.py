"""AzulZero: encoding, symmetry, search and the self-play data pipeline.

The two failure modes these tests exist for are the ones that do not announce
themselves — a flipped value perspective (the network trains happily and learns
nothing) and a round boundary that silently randomizes the search.
"""

from __future__ import annotations

import numpy as np
import pytest

from ai import GreedyAgent
from engine import QuadroGame, apply_action, legal_actions, settle_round
from engine.constants import NUM_ACTIONS, NUM_DISPLAYS
from zero.arena import MatchResult, duel, passes_gate
from zero.augment import apply_permutation
from zero.encode import NUM_FEATURES, PLAYER_OFF, PLAYER_SIZE, encode_state
from zero.mcts import SearchConfig, Tree, search, terminal_value
from zero.numpy_net import ScoreDiffNet, UniformNet
from zero.replay import ReplayBuffer
from zero.selfplay import SelfPlayConfig, _policy_informativeness, play_games


def advance(game: QuadroGame, moves: int) -> QuadroGame:
    """Play `moves` greedy moves to reach a non-trivial position."""
    agent = GreedyAgent(seed=0)
    for _ in range(moves):
        if game.is_over():
            break
        game.step(agent.choose(game.state, game.current))
    return game


# ---------------------------------------------------------------- encoding


def test_encode_shape_and_range():
    game = advance(QuadroGame(seed=11), 12)
    x = encode_state(game.state, 0)
    assert x.shape == (NUM_FEATURES,)
    assert x.dtype == np.float32
    assert np.all(np.isfinite(x))
    assert x.min() >= -1.0 and x.max() <= 2.0


def test_encode_is_deterministic():
    game = advance(QuadroGame(seed=3), 9)
    assert np.array_equal(encode_state(game.state, 1), encode_state(game.state, 1))


def test_perspective_only_swaps_the_two_player_blocks():
    game = advance(QuadroGame(seed=7), 14)
    a = encode_state(game.state, 0)
    b = encode_state(game.state, 1)

    shared = slice(0, PLAYER_OFF)
    assert np.array_equal(a[shared], b[shared])

    me = slice(PLAYER_OFF, PLAYER_OFF + PLAYER_SIZE)
    them = slice(PLAYER_OFF + PLAYER_SIZE, PLAYER_OFF + 2 * PLAYER_SIZE)
    assert np.array_equal(a[me], b[them])
    assert np.array_equal(a[them], b[me])


def test_afterstate_flag_set_only_when_the_table_is_empty():
    game = QuadroGame(seed=5)
    assert encode_state(game.state, 0)[-1] == 0.0
    # Drive the state directly rather than through `step`, which would settle
    # and immediately deal the next round.
    while not game.state.drafting_done():
        apply_action(game.state, legal_actions(game.state)[0])
    settled = game.state.clone()
    settle_round(settled)
    assert encode_state(settled, 0)[-1] == 1.0


# ---------------------------------------------------------------- symmetry


def test_display_permutation_matches_a_relabeled_state():
    """Permuting the encoded features must equal encoding the permuted state."""
    game = advance(QuadroGame(seed=21), 6)
    perm = (2, 0, 4, 1, 3)
    policy = np.zeros(NUM_ACTIONS, dtype=np.float32)
    for action in legal_actions(game.state):
        policy[action.action_id] = 1.0
    policy /= policy.sum()

    features, permuted_policy = apply_permutation(
        encode_state(game.state, game.current), policy, perm
    )

    relabeled = game.state.clone()
    original = [d[:] for d in game.state.displays]
    for source in range(NUM_DISPLAYS):
        relabeled.displays[perm[source]] = original[source]

    assert np.allclose(features, encode_state(relabeled, game.current))
    assert permuted_policy.sum() == pytest.approx(1.0)
    # The permuted policy's support is exactly the relabeled state's legal moves.
    moved = {i for i in range(NUM_ACTIONS) if permuted_policy[i] > 0}
    assert moved == {a.action_id for a in legal_actions(relabeled)}


def test_identity_permutation_changes_nothing():
    game = advance(QuadroGame(seed=4), 5)
    x = encode_state(game.state, 0)
    pi = np.random.default_rng(0).random(NUM_ACTIONS).astype(np.float32)
    f, p = apply_permutation(x, pi, (0, 1, 2, 3, 4))
    assert np.array_equal(f, x)
    assert np.array_equal(p, pi)


# ---------------------------------------------------------------- search


def test_search_returns_a_legal_visit_distribution():
    game = advance(QuadroGame(seed=13), 8)
    config = SearchConfig(simulations=64, dirichlet_epsilon=0.0)
    tree = search(game.state, UniformNet(), config, np.random.default_rng(0))
    pi = tree.visit_distribution()

    assert pi.sum() == pytest.approx(1.0)
    legal = {a.action_id for a in legal_actions(game.state)}
    assert {i for i in range(NUM_ACTIONS) if pi[i] > 0} <= legal


def test_search_does_not_mutate_the_position():
    game = advance(QuadroGame(seed=17), 10)
    before = game.state.to_dict()
    search(
        game.state,
        UniformNet(),
        SearchConfig(simulations=80, dirichlet_epsilon=0.0),
        np.random.default_rng(1),
    )
    assert game.state.to_dict() == before


def test_tree_restores_its_scratch_state_after_every_simulation():
    game = advance(QuadroGame(seed=23), 6)
    tree = Tree(game.state, SearchConfig(simulations=32), np.random.default_rng(2))
    root = tree.state.to_dict()
    for _ in range(40):
        descent = tree.descend()
        value = descent.value if descent.features is None else 0.0
        logits = None if descent.features is None else np.zeros(NUM_ACTIONS, dtype=np.float32)
        tree.backup(descent, logits, value)
        assert tree.state.to_dict() == root


def test_round_boundary_is_deterministic():
    """The afterstate leaf must return the same value on every visit.

    This is what the whole afterstate design buys: no deal sampling means two
    identical searches produce byte-identical statistics.
    """
    game = advance(QuadroGame(seed=29), 4)
    config = SearchConfig(simulations=200, dirichlet_epsilon=0.0)
    a = search(game.state, UniformNet(), config, np.random.default_rng(5))
    b = search(game.state, UniformNet(), config, np.random.default_rng(9))
    assert np.array_equal(a.visit_distribution(), b.visit_distribution())


def test_terminal_value_favours_the_higher_score():
    game = QuadroGame(seed=2)
    agent = GreedyAgent(seed=1)
    while not game.is_over():
        game.step(agent.choose(game.state, game.current))
    v = terminal_value(game.state, SearchConfig())
    scores = [p.score for p in game.state.players]
    if scores[0] > scores[1]:
        assert v > 0
    elif scores[1] > scores[0]:
        assert v < 0
    assert -1.0 <= v <= 1.0


# ---------------------------------------------------------------- arena


ARENA_CONFIG = SelfPlayConfig(games_in_flight=8, search=SearchConfig(simulations=64))


def test_a_real_value_signal_beats_no_signal():
    """The sharpest available check on the perspective conventions.

    `ScoreDiffNet` is a genuine value function ("am I ahead on score?") read
    straight out of the features, so a search driven by it should win clearly
    from either seat. Negating its output — the classic AlphaZero sign bug —
    turns the same agent into one that plays to lose, and this match flips from
    75% to 31%. A search that ignored the value head entirely would sit at 50%.
    """
    result = duel(ScoreDiffNet(), UniformNet(), games=24, config=ARENA_CONFIG, seed=777)
    assert result.score >= 0.65
    assert result.mean_score_a > result.mean_score_b


def test_the_same_evaluator_on_both_sides_is_a_coin_flip():
    """Seat assignment must not be worth anything by itself."""
    result = duel(UniformNet(), UniformNet(), games=24, config=ARENA_CONFIG, seed=555)
    assert 0.25 <= result.score <= 0.75
    assert result.games == 24


def test_gate_rejects_parity_and_accepts_a_clear_win():
    tie = MatchResult(games=200, wins=100, draws=0, losses=100, mean_score_a=0, mean_score_b=0)
    clear = MatchResult(games=200, wins=130, draws=0, losses=70, mean_score_a=0, mean_score_b=0)
    marginal = MatchResult(games=20, wins=12, draws=0, losses=8, mean_score_a=0, mean_score_b=0)
    assert not passes_gate(tie)
    assert passes_gate(clear)
    # 60% over only 20 games is inside the noise; the interval check catches it.
    assert not passes_gate(marginal)


# ---------------------------------------------------------------- self-play


@pytest.fixture(scope="module")
def tiny_records():
    config = SelfPlayConfig(
        games_in_flight=2,
        temperature_moves=4,
        augmentations=1,
        min_policy_kl=0.0,  # keep every policy target; screening has its own tests
        search=SearchConfig(simulations=16, dirichlet_epsilon=0.25),
    )
    return play_games(UniformNet(), 2, config, seed=1)


def test_selfplay_games_terminate_and_produce_samples(tiny_records):
    assert len(tiny_records) == 2
    for record in tiny_records:
        assert record.moves > 0
        assert record.samples
        assert 2 <= record.rounds <= 10


def test_value_targets_are_consistent_with_the_perspective(tiny_records):
    """Every sample's target is the same outcome, negated for player 1."""
    for record in tiny_records:
        values = {s.perspective: set() for s in record.samples}
        for sample in record.samples:
            values[sample.perspective].add(round(sample.value, 6))
        for perspective, seen in values.items():
            assert len(seen) == 1, "one game has exactly one outcome"
        if 0 in values and 1 in values:
            assert next(iter(values[0])) == pytest.approx(-next(iter(values[1])))


def test_value_target_sign_matches_the_winner(tiny_records):
    for record in tiny_records:
        if record.winner is None:
            continue
        for sample in record.samples:
            expected = 1 if sample.perspective == record.winner else -1
            assert np.sign(sample.value) == expected


def test_afterstate_samples_are_value_only(tiny_records):
    afterstates = [s for r in tiny_records for s in r.samples if s.policy_weight == 0.0]
    assert afterstates, "a finished game crosses at least one round boundary"
    for sample in afterstates:
        assert sample.policy.sum() == 0.0
        assert sample.features[-1] == 1.0  # the is-afterstate flag


def test_policy_samples_are_distributions_over_legal_moves(tiny_records):
    policies = [s for r in tiny_records for s in r.samples if s.policy_weight == 1.0]
    assert policies
    for sample in policies:
        assert sample.policy.sum() == pytest.approx(1.0, abs=1e-5)


# ------------------------------------------------- policy target screening


def test_uniform_visits_carry_no_policy_information():
    """A search that decided nothing must not become a policy target.

    This is the guard on the collapse described in `_policy_informativeness`:
    uniform-over-legal is a penalty-heavy distribution in Quadro, so training on
    it teaches the network to throw tiles away.
    """
    pi = np.zeros(NUM_ACTIONS, dtype=np.float32)
    pi[[3, 9, 27, 100]] = 0.25
    assert _policy_informativeness(pi) == pytest.approx(0.0, abs=1e-6)

    decided = np.zeros(NUM_ACTIONS, dtype=np.float32)
    decided[[3, 9, 27, 100]] = [0.85, 0.05, 0.05, 0.05]
    assert _policy_informativeness(decided) > 0.5


def test_a_signal_free_search_produces_almost_no_policy_targets():
    """End to end: an evaluator with no signal contributes value targets only.

    Not *zero* targets — a search late in the last round reaches real terminal
    values and legitimately decides something even with a blind evaluator. But
    that is a couple of positions a game, which is the point: generation 1 has
    essentially nothing to teach the policy head, and this keeps it from
    teaching the wrong thing.
    """
    records = play_games(
        UniformNet(),
        2,
        SelfPlayConfig(
            games_in_flight=2,
            augmentations=0,
            search=SearchConfig(simulations=32, dirichlet_epsilon=0.0),
        ),
        seed=6,
    )
    drafting = [s for r in records for s in r.samples if s.policy.sum() > 0]
    kept = sum(s.policy_weight for s in drafting)
    assert drafting
    assert kept / len(drafting) < 0.1


def test_screening_can_be_disabled():
    records = play_games(
        UniformNet(),
        1,
        SelfPlayConfig(
            games_in_flight=1,
            augmentations=0,
            min_policy_kl=0.0,
            search=SearchConfig(simulations=32, dirichlet_epsilon=0.0),
        ),
        seed=6,
    )
    assert any(s.policy_weight == 1.0 for r in records for s in r.samples)


# ---------------------------------------------------------------- buffer


def test_replay_buffer_roundtrips(tmp_path):
    buffer = ReplayBuffer(capacity=64)
    records = play_games(
        UniformNet(),
        1,
        SelfPlayConfig(
            games_in_flight=1,
            augmentations=0,
            search=SearchConfig(simulations=8, dirichlet_epsilon=0.0),
        ),
        seed=3,
    )
    buffer.add_records(records)
    assert len(buffer) > 0

    path = tmp_path / "replay.npz"
    buffer.save(path)
    reloaded = ReplayBuffer.load(path)
    assert len(reloaded) == len(buffer)
    assert np.array_equal(reloaded.value[: len(buffer)], buffer.value[: len(buffer)])


def test_replay_buffer_evicts_oldest_first():
    buffer = ReplayBuffer(capacity=3)

    class S:
        def __init__(self, v):
            self.features = np.full(NUM_FEATURES, v, dtype=np.float32)
            self.policy = np.zeros(NUM_ACTIONS, dtype=np.float32)
            self.policy_weight = 1.0
            self.value = float(v)

    buffer.add([S(i) for i in range(5)])
    assert len(buffer) == 3
    assert sorted(buffer.value.tolist()) == [2.0, 3.0, 4.0]
