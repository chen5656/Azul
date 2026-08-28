"""State -> fixed-length float vector, from one player's point of view.

Azul has no spatial translation invariance, so the network is an MLP over a flat
feature vector rather than a convolutional stack over board planes
(docs/plans_alphaZero/README.md §2.1).

Two properties the tests pin down:

* **Perspective symmetry.** `encode_state(s, 0)` and `encode_state(s, 1)` differ
  only by swapping the two player blocks. The network therefore never learns
  "player 0 is me"; every value it outputs is from the encoded player's view.
* **Afterstate support.** A round boundary is encoded like any other position,
  with empty displays and the `is_afterstate` flag set. Those positions are real
  training samples (value only), because the search evaluates them as leaves.
"""

from __future__ import annotations

import numpy as np

from engine import GameState
from engine.constants import (
    GRID_COL,
    GRID_SIZE,
    NUM_COLORS,
    NUM_DISPLAYS,
    NUM_PLAYERS,
    NUM_ROWS,
    PENALTY_ROW_SIZE,
    PENALTY_TOTALS,
    STAGING_CAPACITY,
    TILES_PER_COLOR,
)
from engine.state import GAME_OVER

# Normalizers. They only need to keep features roughly in [0, 1]; the exact
# constants are not load-bearing, but they must stay fixed once weights exist.
DISPLAY_NORM = 4.0
CENTER_NORM = 15.0
BAG_NORM = float(TILES_PER_COLOR)
SCORE_NORM = 100.0
ROUND_NORM = 5.0
WORST_PENALTY = float(-PENALTY_TOTALS[PENALTY_ROW_SIZE])  # 14

# --- layout ---------------------------------------------------------------
# Kept as explicit offsets so tests can assert on individual slices and so a
# future feature addition is an obvious, reviewable diff.

TABLE_SIZE = NUM_DISPLAYS * NUM_COLORS + NUM_COLORS + 1  # displays, center, token
POOL_SIZE = 2 * NUM_COLORS  # bag, discard
STAGING_SIZE = NUM_ROWS * (NUM_COLORS + 2)  # color one-hot, fill ratio, is-full
GRID_FEATS = NUM_ROWS * GRID_SIZE
PROGRESS_SIZE = NUM_ROWS + GRID_SIZE + NUM_COLORS  # row / column / color progress
MISC_SIZE = 5  # penalty count, penalty points, first token, overflow, score
PLAYER_SIZE = STAGING_SIZE + GRID_FEATS + PROGRESS_SIZE + MISC_SIZE
GLOBAL_SIZE = 4  # round, tiles left on table, game over, is afterstate

TABLE_OFF = 0
POOL_OFF = TABLE_OFF + TABLE_SIZE
PLAYER_OFF = POOL_OFF + POOL_SIZE
GLOBAL_OFF = PLAYER_OFF + NUM_PLAYERS * PLAYER_SIZE
NUM_FEATURES = GLOBAL_OFF + GLOBAL_SIZE


def _encode_player(out: np.ndarray, off: int, board) -> None:
    """Write one player's block starting at `off`."""
    i = off
    for row in range(NUM_ROWS):
        color = board.staging_colors[row]
        count = board.staging_counts[row]
        if color >= 0:
            out[i + color] = 1.0
        i += NUM_COLORS
        out[i] = count / STAGING_CAPACITY[row]
        out[i + 1] = 1.0 if count == STAGING_CAPACITY[row] else 0.0
        i += 2

    grid = board.grid
    for row in range(NUM_ROWS):
        grid_row = grid[row]
        for col in range(GRID_SIZE):
            if grid_row[col]:
                out[i + col] = 1.0
        i += GRID_SIZE

    # Progress toward each end-of-game bonus, so the value head does not have to
    # rediscover "4 of 5 in a column" from the raw grid every time.
    for row in range(NUM_ROWS):
        out[i + row] = sum(grid[row]) / GRID_SIZE
    i += NUM_ROWS
    for col in range(GRID_SIZE):
        out[i + col] = sum(grid[r][col] for r in range(NUM_ROWS)) / NUM_ROWS
    i += GRID_SIZE
    for color in range(NUM_COLORS):
        out[i + color] = (
            sum(1 for r in range(NUM_ROWS) if grid[r][GRID_COL[r][color]]) / NUM_ROWS
        )
    i += NUM_COLORS

    tiles = len(board.penalty_tiles)
    out[i] = tiles / PENALTY_ROW_SIZE
    out[i + 1] = -PENALTY_TOTALS[tiles] / WORST_PENALTY
    out[i + 2] = 1.0 if board.has_first_token else 0.0
    out[i + 3] = min(board.penalty_overflow, 5) / 5.0
    out[i + 4] = board.score / SCORE_NORM


def encode_state(state: GameState, player: int, out: np.ndarray | None = None) -> np.ndarray:
    """Encode `state` from `player`'s point of view into a float32 vector.

    `out` may be a preallocated row of a batch; it is zeroed first.
    """
    if out is None:
        out = np.zeros(NUM_FEATURES, dtype=np.float32)
    else:
        out[:] = 0.0

    i = TABLE_OFF
    for display in state.displays:
        for color in range(NUM_COLORS):
            out[i + color] = display[color] / DISPLAY_NORM
        i += NUM_COLORS
    for color in range(NUM_COLORS):
        out[i + color] = state.center[color] / CENTER_NORM
    i += NUM_COLORS
    out[i] = 1.0 if state.center_has_token else 0.0

    i = POOL_OFF
    for color in range(NUM_COLORS):
        out[i + color] = state.bag[color] / BAG_NORM
        out[i + NUM_COLORS + color] = state.discard[color] / BAG_NORM

    _encode_player(out, PLAYER_OFF, state.players[player])
    _encode_player(out, PLAYER_OFF + PLAYER_SIZE, state.players[1 - player])

    on_table = sum(state.center) + sum(sum(d) for d in state.displays)
    i = GLOBAL_OFF
    out[i] = state.round_num / ROUND_NORM
    out[i + 1] = on_table / 20.0
    out[i + 2] = 1.0 if state.phase == GAME_OVER else 0.0
    out[i + 3] = 1.0 if on_table == 0 else 0.0
    return out


def encode_batch(items: list[tuple[GameState, int]]) -> np.ndarray:
    out = np.zeros((len(items), NUM_FEATURES), dtype=np.float32)
    for i, (state, player) in enumerate(items):
        encode_state(state, player, out[i])
    return out
