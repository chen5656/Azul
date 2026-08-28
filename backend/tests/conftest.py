import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.constants import GRID_COL, NUM_COLORS, NUM_ROWS  # noqa: E402
from engine.state import GameState  # noqa: E402


@pytest.fixture
def blank() -> GameState:
    """An empty table: nothing on displays, nothing in the bag, no token."""
    state = GameState(rng=random.Random(0))
    state.bag = [0] * NUM_COLORS
    state.center_has_token = False
    return state


def fill_grid(board, cells: list[tuple[int, int]]) -> None:
    for r, c in cells:
        board.grid[r][c] = True


def stage(board, row: int, color: int, count: int) -> None:
    board.staging_colors[row] = color
    board.staging_counts[row] = count


def settle_color_at(row: int, color: int) -> int:
    return GRID_COL[row][color]


def census_ok(state: GameState) -> bool:
    return state.tile_census() == [20] * NUM_COLORS
