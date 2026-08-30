import { GameState, NUM_COLORS, type PlayerBoard, Rng } from '../../src/engine';

/** An empty table: nothing on displays, nothing in the bag, no token. */
export function blank(): GameState {
  const state = new GameState(new Rng(0));
  state.bag = new Array(NUM_COLORS).fill(0);
  state.center_has_token = false;
  return state;
}

export function fillGrid(board: PlayerBoard, cells: [number, number][]): void {
  for (const [r, c] of cells) board.grid[r][c] = true;
}

export function stage(board: PlayerBoard, row: number, color: number, count: number): void {
  board.staging_colors[row] = color;
  board.staging_counts[row] = count;
}
