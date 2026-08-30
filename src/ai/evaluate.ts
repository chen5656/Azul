/**
 * Shared position evaluation — the single place AI strength gets tuned.
 *
 * Port of `backend/ai/evaluate.py`. Greedy scoring, minimax leaves and MCTS
 * rollout cut-offs all call `evaluate`, so a weight change moves every level at
 * once. The function is zero-sum: `evaluate(s, p) === -evaluate(s, 1 - p)`.
 */

import {
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
  type GameState,
  type PlayerBoard,
  scorePlacement,
} from '../engine';

export interface Weights {
  score: number;
  round_end: number;
  staging: number;
  /** a row whose color can no longer be completed */
  dead_staging: number;
  adjacency: number;
  bonus_row: number;
  bonus_column: number;
  bonus_color: number;
  penalty_risk: number;
}

/** Initial values from the plan; tuned against benchmarks and play feel. */
export const DEFAULT_WEIGHTS: Weights = {
  score: 1.0,
  round_end: 1.0,
  staging: 0.3,
  dead_staging: 0.1,
  adjacency: 0.1,
  bonus_row: 0.4,
  bonus_column: 1.5,
  bonus_color: 2.0,
  penalty_risk: 0.2,
};

/** Tiles of `color` a player could still draft, now or in later rounds. */
function available(state: GameState, color: number): number {
  let total = state.bag[color] + state.discard[color] + state.center[color];
  for (const display of state.displays) total += display[color];
  return total;
}

/** Grid as it would look after settling, plus the points settling would score. */
function settledGrid(board: PlayerBoard): [boolean[][], number] {
  const grid = board.grid.map((row) => row.slice());
  let gained = 0;
  for (let row = 0; row < NUM_ROWS; row += 1) {
    if (board.staging_counts[row] !== STAGING_CAPACITY[row]) continue;
    const col = GRID_COL[row][board.staging_colors[row]];
    grid[row][col] = true;
    gained += scorePlacement(grid, row, col)[0];
  }
  return [grid, gained];
}

/**
 * Convex credit for partial rows / columns / color sets.
 *
 * Squaring the completion fraction is what makes 4-of-5 worth far more than
 * twice 2-of-5, which is how the end-game bonuses actually pay out.
 */
function bonusProgress(grid: boolean[][], w: Weights): number {
  let value = 0.0;
  for (const row of grid) {
    let filled = 0;
    for (const cell of row) if (cell) filled += 1;
    value += w.bonus_row * BONUS_ROW * (filled / GRID_SIZE) ** 2;
  }
  for (let col = 0; col < GRID_SIZE; col += 1) {
    let filled = 0;
    for (let r = 0; r < NUM_ROWS; r += 1) if (grid[r][col]) filled += 1;
    value += w.bonus_column * BONUS_COLUMN * (filled / NUM_ROWS) ** 2;
  }
  for (let color = 0; color < NUM_COLORS; color += 1) {
    let filled = 0;
    for (let r = 0; r < NUM_ROWS; r += 1) if (grid[r][GRID_COL[r][color]]) filled += 1;
    value += w.bonus_color * BONUS_COLOR * (filled / NUM_ROWS) ** 2;
  }
  return value;
}

/** Empty cells orthogonally touching a settled tile — future combo room. */
function adjacency(grid: boolean[][]): number {
  let count = 0;
  for (let r = 0; r < NUM_ROWS; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (grid[r][c]) continue;
      if (
        (r > 0 && grid[r - 1][c]) ||
        (r + 1 < NUM_ROWS && grid[r + 1][c]) ||
        (c > 0 && grid[r][c - 1]) ||
        (c + 1 < GRID_SIZE && grid[r][c + 1])
      ) {
        count += 1;
      }
    }
  }
  return count;
}

export function sideValue(
  state: GameState,
  player: number,
  w: Weights = DEFAULT_WEIGHTS,
): number {
  const board = state.players[player];
  const [grid, gained] = settledGrid(board);

  const penalty = PENALTY_TOTALS[board.penalty_tiles.length];
  // Not clamped at 0: the rules floor the *final* score, but clamping here
  // erases the gradient early on, when score + penalty is still negative — the
  // agent then reads a floor dump as free and takes tiles it cannot use.
  const projected = board.score + gained + penalty;
  let value = w.score * board.score + w.round_end * (projected - board.score);

  for (let row = 0; row < NUM_ROWS; row += 1) {
    const count = board.staging_counts[row];
    const capacity = STAGING_CAPACITY[row];
    if (count === 0 || count === capacity) continue;
    const color = board.staging_colors[row];
    // Tiles of this color already committed to the row are not available again.
    const weight =
      available(state, color) >= capacity - count ? w.staging : w.dead_staging;
    value += weight * capacity * (count / capacity);
  }

  value += w.adjacency * adjacency(grid);
  value += bonusProgress(grid, w);

  const held = board.penalty_tiles.length;
  if (held < PENALTY_ROW_SIZE) value += w.penalty_risk * PENALTIES[held]; // negative

  return value;
}

/** Zero-sum value of `state` from `player`'s seat. */
export function evaluate(
  state: GameState,
  player: number,
  w: Weights = DEFAULT_WEIGHTS,
): number {
  return sideValue(state, player, w) - sideValue(state, 1 - player, w);
}
