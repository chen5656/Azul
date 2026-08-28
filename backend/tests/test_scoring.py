"""Adjacency scoring, round settling (E9-E12) and end-of-game bonuses."""

import pytest
from conftest import fill_grid, stage

from engine.constants import (
    BLACK,
    BLUE,
    GRID_COL,
    GRID_SIZE,
    NUM_COLORS,
    NUM_ROWS,
    RED,
    WHITE,
    YELLOW,
)
from engine.events import BonusAwarded, GameEnd, PenaltyApplied, TileScored
from engine.rules import decide_winner, final_scoring, score_placement, settle_round
from engine.state import GAME_OVER


def grid_from(rows: list[str]) -> list[list[bool]]:
    """'#' means a settled tile, '.' means empty."""
    return [[ch == "#" for ch in row] for row in rows]


# ---------------------------------------------------------------- E10 table


@pytest.mark.parametrize(
    "rows, place, expected, h, v",
    [
        # Isolated tile: no neighbors in either direction.
        (["....." ] * 5, (2, 2), 1, 1, 1),
        # Horizontal run of 3, nothing vertical.
        (["....." , ".....", "##...", ".....", "....."], (2, 2), 3, 3, 1),
        # Vertical run of 3, nothing horizontal.
        ([".....", "..#..", "..#..", ".....", "....."], (3, 2), 3, 1, 3),
        # E10: H=1 V=3 scores 3, not 4.
        ([".....", "..#..", "..#..", ".....", "....."], (0, 2), 3, 1, 3),
        # Both directions: H=3 + V=4 = 7.
        ([".#...", ".#...", "#.#..", ".#...", "....."], (2, 1), 7, 3, 4),
        # Completing a full row of 5.
        (["####.", ".....", ".....", ".....", "....."], (0, 4), 5, 5, 1),
        # Completing a full column of 5.
        (["#....", "#....", "#....", "#....", "....."], (4, 0), 5, 1, 5),
        # Bridging two horizontal runs into one.
        ([".....", ".....", "##.##", ".....", "....."], (2, 2), 5, 5, 1),
        # Bridging vertically as well: H=5 + V=5 = 10.
        (["..#..", "..#..", "##.##", "..#..", "..#.."], (2, 2), 10, 5, 5),
    ],
)
def test_score_placement_table(rows, place, expected, h, v):
    grid = grid_from(rows)
    r, c = place
    grid[r][c] = True  # the tile is on the grid before scoring
    points, got_h, got_v = score_placement(grid, r, c)
    assert (points, got_h, got_v) == (expected, h, v)


# ---------------------------------------------------------------- settling


def test_only_full_staging_rows_move_to_the_grid(blank):
    board = blank.players[0]
    stage(board, 0, BLUE, 1)  # full (capacity 1)
    stage(board, 2, RED, 2)  # not full (capacity 3)
    settle_round(blank)

    assert board.grid[0][GRID_COL[0][BLUE]] is True
    assert board.staging_counts[0] == 0
    assert board.staging_counts[2] == 2  # untouched
    assert board.staging_colors[2] == RED
    assert board.score == 1


def test_leftover_tiles_from_a_settled_row_go_to_discard(blank):
    board = blank.players[0]
    stage(board, 4, BLACK, 5)  # 1 tile onto the grid, 4 to discard
    settle_round(blank)
    assert blank.discard[BLACK] == 4


def test_e9_rows_settled_earlier_are_visible_to_later_rows(blank):
    """E9: two rows completing in the same round can score off each other."""
    board = blank.players[0]
    # Two colors that land in the same column on adjacent rows, so the tiles
    # end up vertically adjacent: blue sits at column 1 on row 1, white at
    # column 1 on row 2.
    assert GRID_COL[1][BLUE] == GRID_COL[2][WHITE] == 1
    stage(board, 1, BLUE, 2)
    stage(board, 2, WHITE, 3)

    events = [e for e in settle_round(blank) if isinstance(e, TileScored)]
    assert [(e.row, e.col) for e in events] == [(1, 1), (2, 1)]
    assert events[0].points == 1  # nothing adjacent yet
    assert events[1].points == 2  # sees the tile placed on row 1 this same round
    assert board.score == 3


def test_e11_penalties_clamp_the_score_at_zero(blank):
    board = blank.players[0]
    board.score = 2
    board.penalty_tiles = [BLUE] * 7  # -14
    events = settle_round(blank)
    penalty = next(e for e in events if isinstance(e, PenaltyApplied))
    assert penalty.points == -14
    assert penalty.score_after == 0
    assert board.score == 0


def test_penalty_row_returns_tiles_to_discard_but_keeps_the_token(blank):
    from engine.constants import FIRST_TOKEN

    board = blank.players[0]
    board.penalty_tiles = [FIRST_TOKEN, RED, RED]
    board.has_first_token = True
    settle_round(blank)
    assert blank.discard[RED] == 2
    assert board.penalty_tiles == []
    assert board.has_first_token is True  # survives settling; drives next round


def test_e12_both_players_settle_before_the_game_ends(blank):
    """E12: the round that triggers the end is played out fully for both."""
    p0, p1 = blank.players
    # p0 completes grid row 0 this round; p1 also has a row finishing.
    fill_grid(p0, [(0, 0), (0, 1), (0, 2), (0, 3)])
    stage(p0, 0, GRID_COLOR_AT(0, 4), 1)
    stage(p1, 3, BLACK, 4)

    events = settle_round(blank)
    scored = [e for e in events if isinstance(e, TileScored)]

    assert blank.phase == GAME_OVER
    assert {e.player for e in scored} == {0, 1}  # p1 settled too
    assert p1.grid[3][GRID_COL[3][BLACK]] is True
    assert any(isinstance(e, GameEnd) for e in events)


def GRID_COLOR_AT(row: int, col: int) -> int:
    from engine.constants import GRID_COLOR

    return GRID_COLOR[row][col]


def test_game_does_not_end_without_a_complete_row(blank):
    board = blank.players[0]
    fill_grid(board, [(0, 0), (0, 1), (0, 2), (0, 3)])  # 4 of 5
    settle_round(blank)
    assert blank.phase != GAME_OVER


# ---------------------------------------------------------------- bonuses


def test_final_bonuses_count_rows_columns_and_colors(blank):
    board = blank.players[0]
    for r in range(NUM_ROWS):
        for c in range(GRID_SIZE):
            board.grid[r][c] = True  # a full grid: 5 rows, 5 columns, 5 colors

    events = final_scoring(blank)
    bonus = next(e for e in events if isinstance(e, BonusAwarded) and e.player == 0)
    assert (bonus.rows, bonus.columns, bonus.colors) == (5, 5, 5)
    assert bonus.points == 5 * 2 + 5 * 7 + 5 * 10  # 95


def test_bonus_for_a_single_color_set(blank):
    board = blank.players[0]
    for r in range(NUM_ROWS):
        board.grid[r][GRID_COL[r][WHITE]] = True
    events = final_scoring(blank)
    bonus = next(e for e in events if isinstance(e, BonusAwarded) and e.player == 0)
    assert (bonus.rows, bonus.columns, bonus.colors) == (0, 0, 1)
    assert bonus.points == 10


def test_no_bonus_on_an_empty_grid(blank):
    events = final_scoring(blank)
    assert all(e.points == 0 for e in events if isinstance(e, BonusAwarded))


# ---------------------------------------------------------------- winner


def test_higher_score_wins(blank):
    blank.players[0].score = 40
    blank.players[1].score = 39
    assert decide_winner(blank) == (0, False)


def test_tie_breaks_on_complete_rows(blank):
    blank.players[0].score = blank.players[1].score = 40
    fill_grid(blank.players[1], [(0, c) for c in range(GRID_SIZE)])
    assert decide_winner(blank) == (1, False)


def test_equal_score_and_rows_is_a_draw(blank):
    blank.players[0].score = blank.players[1].score = 40
    assert decide_winner(blank) == (None, True)
