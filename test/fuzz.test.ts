/**
 * Invariant fuzz (BUILD-SPEC §14.4, AC-002).
 *
 * Mirrors the Python fuzz pass: play random legal games and assert that the
 * table never loses or invents a tile, scores never go negative, no color
 * repeats in a grid row or column, exactly one first-player token exists, and
 * every game terminates inside MAX_ROUNDS.
 */

import { describe, expect, it } from 'vitest';

import {
  FIRST_TOKEN,
  GRID_COLOR,
  GRID_SIZE,
  MAX_ROUNDS,
  NUM_COLORS,
  NUM_ROWS,
  QuadroGame,
  Rng,
  TILES_PER_COLOR,
  type GameState,
} from '../src/engine';

const NUM_GAMES = 2000;

function checkInvariants(state: GameState): void {
  // Tile conservation: 20 of each color, always, wherever they sit.
  expect(state.tileCensus()).toEqual(new Array(NUM_COLORS).fill(TILES_PER_COLOR));

  // Exactly one first-player token, on the table or on a penalty row.
  let tokens = state.center_has_token ? 1 : 0;
  for (const board of state.players) {
    tokens += board.penalty_tiles.filter((t) => t === FIRST_TOKEN).length;
    // A player may hold the flag while the row is full and holds no token tile.
    if (board.has_first_token && !board.penalty_tiles.includes(FIRST_TOKEN)) tokens += 1;
  }
  expect(tokens).toBe(1);

  for (const board of state.players) {
    expect(board.score).toBeGreaterThanOrEqual(0);

    // The grid's geometry means a filled cell implies its color; a repeat in a
    // row or column would mean the same color settled twice on that line.
    for (let r = 0; r < NUM_ROWS; r += 1) {
      const seen = new Set<number>();
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (!board.grid[r][c]) continue;
        const color = GRID_COLOR[r][c];
        expect(seen.has(color)).toBe(false);
        seen.add(color);
      }
    }
    for (let c = 0; c < GRID_SIZE; c += 1) {
      const seen = new Set<number>();
      for (let r = 0; r < NUM_ROWS; r += 1) {
        if (!board.grid[r][c]) continue;
        const color = GRID_COLOR[r][c];
        expect(seen.has(color)).toBe(false);
        seen.add(color);
      }
    }
  }
}

/** Play one game with uniformly random legal moves. */
function playRandom(seed: number, checkEveryStep: boolean): QuadroGame {
  const game = new QuadroGame(seed);
  const rng = new Rng(seed ^ 0x5bf03635);
  while (!game.isOver()) {
    const actions = game.legalActions();
    expect(actions.length).toBeGreaterThan(0);
    game.step(actions[rng.nextInt(actions.length)]);
    if (checkEveryStep) checkInvariants(game.state);
  }
  return game;
}

describe('invariant fuzz', () => {
  it(`plays ${NUM_GAMES} random games with zero violations`, () => {
    for (let seed = 0; seed < NUM_GAMES; seed += 1) {
      // Checking every step on all 2,000 games costs minutes; the first 40 get
      // the per-step sweep (as the Python suite does) and the rest are checked
      // at the end of the game, where any earlier corruption still shows up.
      const game = playRandom(seed, seed < 40);
      checkInvariants(game.state);
      expect(game.state.round_num).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(game.state.players.some((p) => p.hasCompleteRow())).toBe(true);

      const result = game.result();
      expect(result.scores.every((s) => s >= 0)).toBe(true);
      if (result.draw) {
        expect(result.winner).toBeNull();
        expect(result.scores[0]).toBe(result.scores[1]);
      } else {
        const w = result.winner as number;
        expect(result.scores[w]).toBeGreaterThanOrEqual(result.scores[1 - w]);
      }
    }
  });
});
