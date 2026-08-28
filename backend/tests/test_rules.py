"""Edge cases E1-E8 from docs/plans/01-engine.md, plus legality and undo."""

import random

import pytest
from conftest import stage

from engine.constants import (
    BLACK,
    BLUE,
    CENTER,
    FIRST_TOKEN,
    GRID_COL,
    GRID_COLOR,
    GRID_SIZE,
    NUM_COLORS,
    NUM_ROWS,
    PENALTY_DEST,
    PENALTY_ROW_SIZE,
    RED,
    WHITE,
    YELLOW,
)
from engine.game import QuadroGame, start_round
from engine.rules import (
    apply_action,
    can_stage,
    is_legal,
    legal_actions,
    preview,
    undo_action,
)
from engine.state import Action


# ---------------------------------------------------------------- geometry


def test_grid_geometry_is_a_latin_square():
    for r in range(NUM_ROWS):
        assert sorted(GRID_COLOR[r]) == list(range(NUM_COLORS))
    for c in range(GRID_SIZE):
        assert sorted(GRID_COLOR[r][c] for r in range(NUM_ROWS)) == list(range(NUM_COLORS))
    for r in range(NUM_ROWS):
        for color in range(NUM_COLORS):
            assert GRID_COLOR[r][GRID_COL[r][color]] == color


def test_action_id_roundtrip():
    seen = set()
    for source in range(CENTER + 1):
        for color in range(NUM_COLORS):
            for dest in range(PENALTY_DEST + 1):
                a = Action(source, color, dest)
                assert Action.from_id(a.action_id) == a
                seen.add(a.action_id)
    assert len(seen) == 180


# ---------------------------------------------------------------- E1, E2


def test_e1_bag_refills_from_discard_mid_fill(blank):
    """E1: when the bag empties halfway through a display, refill and continue."""
    blank.bag = [2, 0, 0, 0, 0]
    blank.discard = [0, 0, 18, 0, 0]
    event = start_round(blank)
    assert sum(sum(d) for d in blank.displays) == 20
    assert sum(blank.displays[0]) == 4  # the interrupted display was completed
    assert event.bag_refilled is True
    assert event.short_displays == 0
    assert blank.discard == [0] * NUM_COLORS


def test_e2_short_displays_when_bag_and_discard_are_empty(blank):
    """E2: with nothing left to draw, displays stay short and play continues."""
    blank.bag = [0] * NUM_COLORS
    blank.discard = [0] * NUM_COLORS
    event = start_round(blank)
    assert all(sum(d) == 0 for d in blank.displays)
    assert event.short_displays == 5
    assert event.bag_refilled is False


def test_partial_fill_reports_only_the_short_display(blank):
    blank.bag = [0] * NUM_COLORS
    blank.discard = [17, 0, 0, 0, 0]  # 4 displays full, the fifth gets 1
    event = start_round(blank)
    assert event.short_displays == 1
    assert sum(sum(d) for d in blank.displays) == 17


# ---------------------------------------------------------------- E3, E4, E5


def test_e3_dumping_is_always_available(blank):
    """E3: a color legal nowhere can still be taken onto the penalty row."""
    board = blank.players[0]
    for row in range(NUM_ROWS):
        board.grid[row][GRID_COL[row][BLUE]] = True  # blue settled on every row
    blank.displays[0][BLUE] = 3

    actions = legal_actions(blank)
    assert actions == [Action(0, BLUE, PENALTY_DEST)]
    assert all(not can_stage(board, r, BLUE) for r in range(NUM_ROWS))


def test_e4_a_full_staging_row_cannot_be_chosen(blank):
    board = blank.players[0]
    stage(board, 2, RED, 3)  # row index 2 has capacity 3 — full
    blank.displays[0][RED] = 2
    dests = {a.dest for a in legal_actions(blank) if a.color == RED}
    assert 2 not in dests
    assert PENALTY_DEST in dests


def test_staging_row_locks_to_one_color(blank):
    board = blank.players[0]
    stage(board, 3, RED, 1)
    blank.displays[0][YELLOW] = 1
    blank.displays[0][RED] = 1
    dests_yellow = {a.dest for a in legal_actions(blank) if a.color == YELLOW}
    dests_red = {a.dest for a in legal_actions(blank) if a.color == RED}
    assert 3 not in dests_yellow
    assert 3 in dests_red


def test_e5_center_holding_only_the_token_is_not_a_source(blank):
    blank.center_has_token = True
    blank.displays[0][BLUE] = 1
    assert all(a.source != CENTER for a in legal_actions(blank))


# ---------------------------------------------------------------- E6, E7, E8


def test_e6_token_takes_its_penalty_slot_before_overflow(blank):
    """E6: the token is placed the instant it is taken, ahead of the tiles."""
    blank.center[RED] = 3
    blank.center_has_token = True
    apply_action(blank, Action(CENTER, RED, 0))  # row 0 holds 1, so 2 overflow
    board = blank.players[0]
    assert board.penalty_tiles == [FIRST_TOKEN, RED, RED]
    assert board.has_first_token is True
    assert blank.center_has_token is False


def test_e7_overflow_from_a_capacity_one_row(blank):
    blank.displays[0][WHITE] = 5
    p = preview(blank, Action(0, WHITE, 0))
    assert (p.placed, p.overflow, p.to_discard) == (1, 4, 0)
    event = apply_action(blank, Action(0, WHITE, 0)).event
    board = blank.players[0]
    assert board.staging_counts[0] == 1
    assert board.penalty_tiles == [WHITE] * 4
    assert (event.placed, event.overflow) == (1, 4)


def test_e8_tiles_beyond_seven_slots_go_straight_to_discard(blank):
    board = blank.players[0]
    board.penalty_tiles = [BLUE] * 6
    blank.displays[0][RED] = 3
    p = preview(blank, Action(0, RED, PENALTY_DEST))
    assert (p.placed, p.overflow, p.to_discard) == (0, 3, 2)

    apply_action(blank, Action(0, RED, PENALTY_DEST))
    assert len(board.penalty_tiles) == PENALTY_ROW_SIZE
    assert board.penalty_overflow == 2
    assert blank.discard[RED] == 2


def test_token_on_a_full_penalty_row_costs_nothing_but_still_leads(blank):
    """The token never occupies a slot it cannot have, and never hits discard."""
    board = blank.players[0]
    board.penalty_tiles = [BLUE] * PENALTY_ROW_SIZE
    blank.center[RED] = 1
    blank.center_has_token = True

    apply_action(blank, Action(CENTER, RED, PENALTY_DEST))
    assert board.has_first_token is True
    assert len(board.penalty_tiles) == PENALTY_ROW_SIZE
    assert FIRST_TOKEN not in board.penalty_tiles
    assert board.penalty_overflow == 1  # only the red tile overflowed
    assert blank.discard[RED] == 1


# ---------------------------------------------------------------- drafting


def test_leftovers_from_a_display_move_to_the_center(blank):
    blank.displays[2] = [1, 2, 1, 0, 0]
    apply_action(blank, Action(2, YELLOW, PENALTY_DEST))
    assert blank.displays[2] == [0] * NUM_COLORS
    assert blank.center == [1, 0, 1, 0, 0]


def test_taking_from_the_center_leaves_other_colors(blank):
    blank.center = [2, 3, 0, 0, 0]
    apply_action(blank, Action(CENTER, BLUE, PENALTY_DEST))
    assert blank.center == [0, 3, 0, 0, 0]


def test_turn_passes_to_the_other_player(blank):
    blank.displays[0][BLUE] = 1
    apply_action(blank, Action(0, BLUE, 0))
    assert blank.current == 1


def test_preview_matches_apply(blank):
    """Every previewed number must match what applying the action really does."""
    rng = random.Random(11)
    game = QuadroGame(seed=99)
    for _ in range(60):
        if game.is_over():
            break
        state = game.state
        for action in legal_actions(state):
            p = preview(state, action)
            probe = state.clone()
            overflow_before = probe.players[probe.current].penalty_overflow
            ev = apply_action(probe, action).event
            board_after = probe.players[state.current]
            assert ev.placed == p.placed
            assert ev.overflow + ev.to_discard == p.overflow
            assert ev.to_discard == p.to_discard
            assert board_after.penalty_overflow - overflow_before == p.to_discard
            assert board_after.penalty_total() == p.penalty_after
        game.step(rng.choice(game.legal_actions()))


# ---------------------------------------------------------------- undo


def test_undo_restores_state_exactly():
    """The undo path used by search must agree with the clone path."""
    rng = random.Random(5)
    game = QuadroGame(seed=1234)
    for _ in range(80):
        if game.is_over():
            break
        state = game.state
        for action in legal_actions(state):
            reference = state.clone()
            apply_action(reference, action)

            undo = apply_action(state, action)
            assert state.to_dict(include_rng=False) == reference.to_dict(include_rng=False)
            undo_action(state, undo)
        snapshot = state.to_dict(include_rng=False)
        game.step(rng.choice(game.legal_actions()))
        assert snapshot != state.to_dict(include_rng=False)


def test_is_legal_rejects_out_of_range_and_empty_sources(blank):
    blank.displays[0][BLUE] = 1
    assert is_legal(blank, Action(0, BLUE, 0))
    assert not is_legal(blank, Action(0, RED, 0))  # no red on that display
    assert not is_legal(blank, Action(1, BLUE, 0))  # empty display
    assert not is_legal(blank, Action(9, BLUE, 0))
    assert not is_legal(blank, Action(0, BLUE, 9))


def test_legal_actions_are_unique(blank):
    blank.displays[0] = [2, 2, 0, 0, 0]
    blank.center = [1, 0, 1, 0, 0]
    actions = legal_actions(blank)
    assert len(actions) == len(set(actions))


def test_no_moves_once_the_game_is_over(blank):
    from engine.state import GAME_OVER

    blank.phase = GAME_OVER
    blank.displays[0][BLUE] = 1
    assert legal_actions(blank) == []
    assert not is_legal(blank, Action(0, BLUE, 0))
