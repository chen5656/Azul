/** Placement scoring, settling, bonuses and the winner decision. */

import { describe, expect, it } from 'vitest';

import {
  BLUE,
  BONUS_COLOR,
  BONUS_COLUMN,
  BONUS_ROW,
  GAME_OVER,
  GRID_COL,
  NUM_ROWS,
  RED,
  decideWinner,
  finalScoring,
  scorePlacement,
  settleRound,
  type GameEvent,
} from '../../src/engine';
import { blank, fillGrid, stage } from './helpers';

function grid(cells: [number, number][]): boolean[][] {
  const g = Array.from({ length: 5 }, () => new Array(5).fill(false));
  for (const [r, c] of cells) g[r][c] = true;
  return g;
}

describe('scorePlacement', () => {
  it('scores a lone tile as 1', () => {
    expect(scorePlacement(grid([[2, 2]]), 2, 2)).toEqual([1, 1, 1]);
  });

  it('scores the whole horizontal run', () => {
    const [points, h, v] = scorePlacement(grid([[0, 0], [0, 1], [0, 2]]), 0, 1);
    expect([points, h, v]).toEqual([3, 3, 1]);
  });

  it('adds both runs when a tile joins a row and a column', () => {
    const cells: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]];
    const [points, h, v] = scorePlacement(grid(cells), 1, 1);
    expect([points, h, v]).toEqual([6, 3, 3]);
  });
});

describe('settleRound', () => {
  it('moves only completed rows and returns the spare tiles to the discard', () => {
    const state = blank();
    const board = state.players[0];
    stage(board, 2, BLUE, 3); // complete
    stage(board, 3, RED, 2); // incomplete

    const events = settleRound(state);
    expect(board.grid[2][GRID_COL[2][BLUE]]).toBe(true);
    expect(board.staging_counts[2]).toBe(0);
    expect(board.staging_counts[3]).toBe(2); // untouched
    expect(state.discard[BLUE]).toBe(2); // capacity 3, one tile lands on the grid
    expect(events.filter((e) => e.kind === 'tile_scored')).toHaveLength(1);
  });

  it('applies penalties and never drives a score below zero', () => {
    const state = blank();
    const board = state.players[0];
    board.score = 1;
    board.penalty_tiles = [RED, RED, RED];
    settleRound(state);
    expect(board.score).toBe(0);
    expect(board.penalty_tiles).toEqual([]);
    expect(state.discard[RED]).toBe(3);
  });

  it('ends the game as soon as a grid row is complete', () => {
    const state = blank();
    const board = state.players[0];
    for (let col = 0; col < 4; col += 1) board.grid[0][col] = true;
    const missing = 4;
    stage(board, 0, (missing - 0 + 5) % 5, 1);

    const events = settleRound(state);
    expect(state.phase).toBe(GAME_OVER);
    expect(events.some((e: GameEvent) => e.kind === 'game_end')).toBe(true);
  });
});

describe('final scoring', () => {
  it('awards row, column and color bonuses', () => {
    const state = blank();
    const board = state.players[0];
    // A full grid: 5 rows, 5 columns, 5 colors.
    fillGrid(
      board,
      Array.from({ length: 25 }, (_, i) => [Math.floor(i / 5), i % 5] as [number, number]),
    );
    finalScoring(state);
    expect(board.score).toBe(5 * BONUS_ROW + 5 * BONUS_COLUMN + 5 * BONUS_COLOR);
  });

  it('counts a color only when all five of its cells are filled', () => {
    const state = blank();
    const board = state.players[0];
    for (let r = 0; r < NUM_ROWS; r += 1) board.grid[r][GRID_COL[r][BLUE]] = true;
    expect(board.completeColors()).toBe(1);
    expect(board.completeRows()).toBe(0);
    expect(board.completeColumns()).toBe(0);
  });
});

describe('decideWinner', () => {
  it('gives it to the higher score', () => {
    const state = blank();
    state.players[0].score = 40;
    state.players[1].score = 39;
    expect(decideWinner(state)).toEqual([0, false]);
  });

  it('breaks a tied score on completed rows', () => {
    const state = blank();
    state.players[0].score = 40;
    state.players[1].score = 40;
    fillGrid(state.players[1], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(decideWinner(state)).toEqual([1, false]);
  });

  it('reports a draw when score and rows both tie', () => {
    const state = blank();
    state.players[0].score = 40;
    state.players[1].score = 40;
    expect(decideWinner(state)).toEqual([null, true]);
  });
});
