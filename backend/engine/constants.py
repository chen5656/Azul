"""Quadro constants and fixed board geometry.

Colors are plain ints 0..4 rather than an Enum: the search hot path calls into
this module millions of times per game and attribute lookups are not free.
Human-readable names are only applied at the serialization boundary.
"""

NUM_COLORS = 5
BLUE, YELLOW, RED, BLACK, WHITE = range(NUM_COLORS)
COLOR_NAMES = ("blue", "yellow", "red", "black", "white")
COLOR_INITIALS = ("B", "Y", "R", "K", "W")
COLOR_BY_NAME = {name: i for i, name in enumerate(COLOR_NAMES)}

FIRST_TOKEN = -1

NUM_PLAYERS = 2
NUM_DISPLAYS = 5
DISPLAY_SIZE = 4
TILES_PER_COLOR = 20
TOTAL_TILES = NUM_COLORS * TILES_PER_COLOR

GRID_SIZE = 5
NUM_ROWS = 5
STAGING_CAPACITY = (1, 2, 3, 4, 5)

PENALTIES = (-1, -1, -2, -2, -2, -3, -3)
PENALTY_ROW_SIZE = len(PENALTIES)

BONUS_ROW = 2
BONUS_COLUMN = 7
BONUS_COLOR = 10

# Action encoding: source 0..4 = displays, 5 = center; dest 0..4 = staging rows,
# 5 = discard the whole group onto the penalty row.
CENTER = NUM_DISPLAYS
NUM_SOURCES = NUM_DISPLAYS + 1
PENALTY_DEST = NUM_ROWS
NUM_DESTS = NUM_ROWS + 1
NUM_ACTIONS = NUM_SOURCES * NUM_COLORS * NUM_DESTS  # 180

# Hard cap used by tests and drivers to prove the game always terminates.
MAX_ROUNDS = 150


def grid_color(row: int, col: int) -> int:
    """Color that belongs at (row, col) on the grid."""
    return (col - row) % NUM_COLORS


def grid_col(row: int, color: int) -> int:
    """Column where `color` belongs on `row`."""
    return (color + row) % NUM_COLORS


# Precomputed lookup tables; the search path prefers indexing over arithmetic.
GRID_COLOR = tuple(tuple(grid_color(r, c) for c in range(GRID_SIZE)) for r in range(NUM_ROWS))
GRID_COL = tuple(tuple(grid_col(r, color) for color in range(NUM_COLORS)) for r in range(NUM_ROWS))

# Cumulative penalty for holding n tiles on the penalty row.
PENALTY_TOTALS = tuple(sum(PENALTIES[:n]) for n in range(PENALTY_ROW_SIZE + 1))
