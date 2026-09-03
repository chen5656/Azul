/**
 * Quadro constants and fixed board geometry.
 *
 * A verbatim port of `backend/engine/constants.py`. Colors stay plain ints 0..4
 * for the same reason they do there: the search hot path indexes these tables
 * millions of times per game. Names are applied only at the serialization
 * boundary.
 */

export const NUM_COLORS = 5;
export const BLUE = 0;
export const YELLOW = 1;
export const RED = 2;
export const GREEN = 3;
export const WHITE = 4;

/**
 * What a color is called on the wire. Frozen: the Python exporter, the parity
 * vectors and every stored payload spell color 3 "black", so serialization must
 * keep doing so even though the tiles are drawn green.
 */
export const COLOR_WIRE_NAMES = ['blue', 'yellow', 'red', 'black', 'white'] as const;
export type ColorName = (typeof COLOR_WIRE_NAMES)[number];

/** What a color is called on screen. Display only — never serialize these. */
export const COLOR_NAMES = ['blue', 'yellow', 'red', 'green', 'white'] as const;
export const COLOR_INITIALS = ['B', 'Y', 'R', 'G', 'W'] as const;

export const COLOR_BY_NAME: Record<string, number> = Object.fromEntries(
  COLOR_WIRE_NAMES.map((name, i) => [name, i]),
);
// Accept the display spelling too, so a hand-written payload still parses.
COLOR_BY_NAME.green = GREEN;

export const FIRST_TOKEN = -1;

export const NUM_PLAYERS = 2;
export const NUM_DISPLAYS = 5;
export const DISPLAY_SIZE = 4;
export const TILES_PER_COLOR = 20;
export const TOTAL_TILES = NUM_COLORS * TILES_PER_COLOR;

export const GRID_SIZE = 5;
export const NUM_ROWS = 5;
export const STAGING_CAPACITY = [1, 2, 3, 4, 5] as const;

export const PENALTIES = [-1, -1, -2, -2, -2, -3, -3] as const;
export const PENALTY_ROW_SIZE = PENALTIES.length;

export const BONUS_ROW = 2;
export const BONUS_COLUMN = 7;
export const BONUS_COLOR = 10;

// Action encoding: source 0..4 = displays, 5 = center; dest 0..4 = staging rows,
// 5 = discard the whole group onto the penalty row.
export const CENTER = NUM_DISPLAYS;
export const NUM_SOURCES = NUM_DISPLAYS + 1;
export const PENALTY_DEST = NUM_ROWS;
export const NUM_DESTS = NUM_ROWS + 1;
export const NUM_ACTIONS = NUM_SOURCES * NUM_COLORS * NUM_DESTS; // 180

// Hard cap used by tests and drivers to prove the game always terminates.
export const MAX_ROUNDS = 150;

/** Color that belongs at (row, col) on the grid. */
export function gridColor(row: number, col: number): number {
  return ((col - row) % NUM_COLORS + NUM_COLORS) % NUM_COLORS;
}

/** Column where `color` belongs on `row`. */
export function gridCol(row: number, color: number): number {
  return (color + row) % NUM_COLORS;
}

// Precomputed lookup tables; the search path prefers indexing over arithmetic.
export const GRID_COLOR: readonly (readonly number[])[] = Array.from(
  { length: NUM_ROWS },
  (_, r) => Array.from({ length: GRID_SIZE }, (_, c) => gridColor(r, c)),
);

export const GRID_COL: readonly (readonly number[])[] = Array.from(
  { length: NUM_ROWS },
  (_, r) => Array.from({ length: NUM_COLORS }, (_, color) => gridCol(r, color)),
);

// Cumulative penalty for holding n tiles on the penalty row.
export const PENALTY_TOTALS: readonly number[] = Array.from(
  { length: PENALTY_ROW_SIZE + 1 },
  (_, n) => PENALTIES.slice(0, n).reduce((a, b) => a + b, 0),
);
