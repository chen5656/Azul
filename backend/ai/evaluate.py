"""Shared position evaluation — the single place AI strength gets tuned.

Greedy scoring, Minimax leaves and MCTS rollout cut-offs all call `evaluate`,
so a weight change moves every level at once (docs/plans/03-ai.md §2).

The function is zero-sum: `evaluate(state, p) == -evaluate(state, 1 - p)`.
"""

from __future__ import annotations

from dataclasses import dataclass

from engine import GameState, PlayerBoard, score_placement
from engine.constants import (
    BONUS_COLOR,
    BONUS_COLUMN,
    BONUS_ROW,
    GRID_COL,
    GRID_SIZE,
    NUM_COLORS,
    NUM_ROWS,
    PENALTIES,
    PENALTY_ROW_SIZE,
    PENALTY_TOTALS,
    STAGING_CAPACITY,
)


@dataclass(frozen=True, slots=True)
class Weights:
    """Initial values from the plan; tuned against benchmarks + play feel."""

    score: float = 1.0
    round_end: float = 1.0
    staging: float = 0.3
    dead_staging: float = 0.1  # a row whose color can no longer be completed
    adjacency: float = 0.1
    bonus_row: float = 0.4
    bonus_column: float = 1.5
    bonus_color: float = 2.0
    penalty_risk: float = 0.2


DEFAULT_WEIGHTS = Weights()


def _available(state: GameState, color: int) -> int:
    """Tiles of `color` a player could still draft, now or in later rounds."""
    total = state.bag[color] + state.discard[color] + state.center[color]
    for display in state.displays:
        total += display[color]
    return total


def _settled_grid(board: PlayerBoard) -> tuple[list[list[bool]], int]:
    """Grid as it would look after settling, plus the points that settling scores."""
    grid = [row[:] for row in board.grid]
    gained = 0
    for row in range(NUM_ROWS):
        if board.staging_counts[row] != STAGING_CAPACITY[row]:
            continue
        col = GRID_COL[row][board.staging_colors[row]]
        grid[row][col] = True
        gained += score_placement(grid, row, col)[0]
    return grid, gained


def _bonus_progress(grid: list[list[bool]], w: Weights) -> float:
    """Convex credit for partial rows / columns / color sets.

    Squaring the completion fraction is what makes 4-of-5 worth far more than
    twice 2-of-5, which is how the end-game bonuses actually pay out.
    """
    value = 0.0
    for row in grid:
        filled = sum(row)
        value += w.bonus_row * BONUS_ROW * (filled / GRID_SIZE) ** 2
    for col in range(GRID_SIZE):
        filled = sum(1 for r in range(NUM_ROWS) if grid[r][col])
        value += w.bonus_column * BONUS_COLUMN * (filled / NUM_ROWS) ** 2
    for color in range(NUM_COLORS):
        filled = sum(1 for r in range(NUM_ROWS) if grid[r][GRID_COL[r][color]])
        value += w.bonus_color * BONUS_COLOR * (filled / NUM_ROWS) ** 2
    return value


def _adjacency(grid: list[list[bool]]) -> int:
    """Empty cells orthogonally touching a settled tile — future combo room."""
    count = 0
    for r in range(NUM_ROWS):
        for c in range(GRID_SIZE):
            if grid[r][c]:
                continue
            if (
                (r > 0 and grid[r - 1][c])
                or (r + 1 < NUM_ROWS and grid[r + 1][c])
                or (c > 0 and grid[r][c - 1])
                or (c + 1 < GRID_SIZE and grid[r][c + 1])
            ):
                count += 1
    return count


def side_value(state: GameState, player: int, w: Weights = DEFAULT_WEIGHTS) -> float:
    board = state.players[player]
    grid, gained = _settled_grid(board)

    penalty = PENALTY_TOTALS[len(board.penalty_tiles)]
    # Not clamped at 0: the rules floor the *final* score, but clamping here
    # erases the gradient early on, when score + penalty is still negative --
    # the agent then reads a floor dump as free and takes tiles it cannot use.
    projected = board.score + gained + penalty
    value = w.score * board.score + w.round_end * (projected - board.score)

    for row in range(NUM_ROWS):
        count = board.staging_counts[row]
        capacity = STAGING_CAPACITY[row]
        if count == 0 or count == capacity:
            continue
        color = board.staging_colors[row]
        # Tiles of this color already committed to the row are not available again.
        weight = w.staging if _available(state, color) >= capacity - count else w.dead_staging
        value += weight * capacity * (count / capacity)

    value += w.adjacency * _adjacency(grid)
    value += _bonus_progress(grid, w)

    held = len(board.penalty_tiles)
    if held < PENALTY_ROW_SIZE:
        value += w.penalty_risk * PENALTIES[held]  # negative: holding slots hurts
    return value


def evaluate(state: GameState, player: int, w: Weights = DEFAULT_WEIGHTS) -> float:
    """Zero-sum value of `state` from `player`'s seat."""
    return side_value(state, player, w) - side_value(state, 1 - player, w)
