"""Driver-level tests: invariants over many random games, determinism, replay."""

import random

import pytest

from engine.constants import (
    FIRST_TOKEN,
    GRID_COLOR,
    GRID_SIZE,
    MAX_ROUNDS,
    NUM_COLORS,
    NUM_ROWS,
    PENALTY_ROW_SIZE,
    STAGING_CAPACITY,
    TILES_PER_COLOR,
)
from engine.game import IllegalAction, QuadroGame
from engine.state import GAME_OVER, Action, GameState


def check_invariants(state: GameState) -> None:
    assert state.tile_census() == [TILES_PER_COLOR] * NUM_COLORS

    for board in state.players:
        assert board.score >= 0
        assert len(board.penalty_tiles) <= PENALTY_ROW_SIZE
        assert board.penalty_tiles.count(FIRST_TOKEN) <= 1

        for row in range(NUM_ROWS):
            count = board.staging_counts[row]
            color = board.staging_colors[row]
            assert 0 <= count <= STAGING_CAPACITY[row]
            assert (color >= 0) == (count > 0), "a row holds tiles iff it has a color"
            if color >= 0:
                # A color already settled on the grid must not sit staged again.
                from engine.constants import GRID_COL

                assert not board.grid[row][GRID_COL[row][color]]

        # No color may appear twice on a grid row or column.
        for r in range(NUM_ROWS):
            colors = [GRID_COLOR[r][c] for c in range(GRID_SIZE) if board.grid[r][c]]
            assert len(colors) == len(set(colors))
        for c in range(GRID_SIZE):
            colors = [GRID_COLOR[r][c] for r in range(NUM_ROWS) if board.grid[r][c]]
            assert len(colors) == len(set(colors))

    # Exactly one first token exists, somewhere.
    tokens = int(state.center_has_token) + sum(p.has_first_token for p in state.players)
    assert tokens == 1


def play_random(seed: int, move_seed: int | None = None, check_every_step: bool = False):
    game = QuadroGame(seed=seed)
    rng = random.Random(move_seed if move_seed is not None else seed)
    while not game.is_over():
        actions = game.legal_actions()
        assert actions, "a player must always have a legal move while tiles remain"
        game.step(rng.choice(actions))
        if check_every_step:
            check_invariants(game.state)
    return game


def test_random_games_hold_every_invariant():
    for seed in range(40):
        game = play_random(seed, check_every_step=True)
        assert game.state.round_num <= MAX_ROUNDS
        assert any(p.has_complete_row() for p in game.state.players)


@pytest.mark.parametrize("seed", range(8))
def test_games_terminate_and_produce_a_result(seed):
    game = play_random(seed)
    result = game.result()
    assert game.is_over()
    assert all(s >= 0 for s in result.scores)
    if result.draw:
        assert result.winner is None
        assert result.scores[0] == result.scores[1]
    else:
        assert result.scores[result.winner] >= result.scores[1 - result.winner]


def test_same_seed_produces_the_same_game():
    a = play_random(2024, move_seed=1)
    b = play_random(2024, move_seed=1)
    assert a.history == b.history
    assert a.state.to_dict() == b.state.to_dict()
    assert a.result() == b.result()


def test_different_seeds_deal_differently():
    a = QuadroGame(seed=1)
    b = QuadroGame(seed=2)
    assert a.state.displays != b.state.displays


def test_state_serialization_roundtrips():
    game = QuadroGame(seed=77)
    for _ in range(25):
        game.step(random.Random(3).choice(game.legal_actions()))

    d = game.state.to_dict()
    restored = GameState.from_dict(d)
    assert restored.to_dict() == d
    # The restored rng must continue the same sequence.
    assert [restored.rng.random() for _ in range(5)] == [
        game.state.rng.random() for _ in range(5)
    ]


def test_serialization_survives_json():
    import json

    game = play_random(42)
    d = game.state.to_dict()
    assert GameState.from_dict(json.loads(json.dumps(d))).to_dict() == d


def test_clone_is_independent():
    game = QuadroGame(seed=9)
    copy = game.state.clone()
    game.step(game.legal_actions()[0])
    assert copy.to_dict(include_rng=False) != game.state.to_dict(include_rng=False)


def test_replay_from_log_reproduces_the_game():
    game = play_random(555, move_seed=8)
    log = game.to_log()
    replayed = QuadroGame.from_log(log)
    assert replayed.result() == game.result()
    assert replayed.state.to_dict() == game.state.to_dict()


def test_replay_rejects_a_tampered_log():
    game = play_random(556, move_seed=8)
    log = game.to_log()
    log["actions"][3]["source"] = (log["actions"][3]["source"] + 1) % 5
    log["actions"][3]["color"] = "black"
    with pytest.raises(IllegalAction):
        QuadroGame.from_log(log)


def test_stepping_an_illegal_action_raises_and_changes_nothing():
    game = QuadroGame(seed=3)
    before = game.state.to_dict()
    legal = set(game.legal_actions())
    bogus = next(
        Action(s, c, d)
        for s in range(6)
        for c in range(NUM_COLORS)
        for d in range(6)
        if Action(s, c, d) not in legal
    )
    with pytest.raises(IllegalAction):
        game.step(bogus)
    assert game.state.to_dict() == before


def test_stepping_after_game_over_raises():
    game = play_random(11)
    with pytest.raises(IllegalAction):
        game.step(Action(0, 0, 0))


def test_first_token_holder_leads_the_next_round():
    for seed in range(15):
        game = QuadroGame(seed=seed)
        rng = random.Random(seed)
        round_num = game.state.round_num
        while not game.is_over():
            holder_before = next(
                (i for i, p in enumerate(game.state.players) if p.has_first_token), None
            )
            game.step(rng.choice(game.legal_actions()))
            if game.state.round_num != round_num and not game.is_over():
                # A new round was dealt; whoever held the token now leads.
                if holder_before is not None:
                    assert game.state.first_player == holder_before
                assert game.state.current == game.state.first_player
                round_num = game.state.round_num


def test_first_round_deals_twenty_tiles():
    game = QuadroGame(seed=17)
    assert sum(sum(d) for d in game.state.displays) == 20
    assert game.state.center_has_token
    assert not any(game.state.center)
    assert sum(game.state.bag) == 80
