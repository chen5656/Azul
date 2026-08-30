/**
 * Rules of Quadro: legal move generation, move application, round settling.
 *
 * Port of `backend/engine/rules.py`. This is the layer the AI search calls
 * directly: `applyAction` returns an `Undo` record so a search can walk the tree
 * without cloning. `applyAction` deliberately does *not* settle the round — the
 * caller checks `state.draftingDone()` and calls `settleRound`. Keeping settling
 * out of the undo path is what keeps `Undo` small and safe.
 *
 * `undoAction` exists for the search only. No player-facing undo exists in
 * either mode (BUILD-SPEC D-014).
 */

import {
  BONUS_COLOR,
  BONUS_COLUMN,
  BONUS_ROW,
  CENTER,
  FIRST_TOKEN,
  GRID_COL,
  GRID_SIZE,
  NUM_COLORS,
  NUM_DISPLAYS,
  NUM_ROWS,
  PENALTY_DEST,
  PENALTY_ROW_SIZE,
  PENALTY_TOTALS,
  STAGING_CAPACITY,
} from './constants';
import type { Draft, GameEvent } from './events';
import { Action, GAME_OVER, GameState, PlayerBoard } from './state';

// ---------------------------------------------------------------- legality

/** Whether `color` may be placed on staging `row` of `board`. */
export function canStage(board: PlayerBoard, row: number, color: number): boolean {
  if (board.grid[row][GRID_COL[row][color]]) return false; // already settled on this grid row
  const current = board.staging_colors[row];
  if (current < 0) return true;
  return current === color && board.staging_counts[row] < STAGING_CAPACITY[row];
}

/**
 * Every legal action for `state.current`.
 *
 * Dumping a whole group onto the penalty row is always available, so a player
 * can never be left without a move while tiles remain.
 */
export function legalActions(state: GameState): Action[] {
  if (state.phase === GAME_OVER) return [];
  const board = state.players[state.current];
  const out: Action[] = [];
  for (let source = 0; source <= NUM_DISPLAYS; source += 1) {
    const counts = source === CENTER ? state.center : state.displays[source];
    for (let color = 0; color < NUM_COLORS; color += 1) {
      if (!counts[color]) continue;
      for (let row = 0; row < NUM_ROWS; row += 1) {
        if (canStage(board, row, color)) out.push(new Action(source, color, row));
      }
      out.push(new Action(source, color, PENALTY_DEST));
    }
  }
  return out;
}

export function isLegal(state: GameState, action: Action): boolean {
  if (state.phase === GAME_OVER) return false;
  if (!(action.source >= 0 && action.source <= CENTER)) return false;
  if (!(action.color >= 0 && action.color < NUM_COLORS)) return false;
  if (!(action.dest >= 0 && action.dest <= PENALTY_DEST)) return false;
  const counts = action.source === CENTER ? state.center : state.displays[action.source];
  if (!counts[action.color]) return false;
  if (action.dest === PENALTY_DEST) return true;
  return canStage(state.players[state.current], action.dest, action.color);
}

// ---------------------------------------------------------------- preview

/**
 * What an action would do, without doing it. The UI's placement preview shows
 * numbers computed here rather than re-deriving them.
 */
export interface Preview {
  /** tiles taken from the source */
  count: number;
  /** tiles landing on the staging row */
  placed: number;
  /** tiles landing on the penalty row */
  overflow: number;
  /** tiles falling off the end of a full penalty row */
  to_discard: number;
  takes_token: boolean;
  penalty_before: number;
  penalty_after: number;
}

export function penaltyDelta(p: Preview): number {
  return p.penalty_after - p.penalty_before;
}

export function previewToDict(p: Preview): Record<string, unknown> {
  return {
    count: p.count,
    placed: p.placed,
    overflow: p.overflow,
    to_discard: p.to_discard,
    takes_token: p.takes_token,
    penalty_delta: penaltyDelta(p),
  };
}

export function preview(state: GameState, action: Action): Preview {
  const board = state.players[state.current];
  const counts = action.source === CENTER ? state.center : state.displays[action.source];
  const count = counts[action.color];
  const takesToken = action.source === CENTER && state.center_has_token;

  let slotsUsed = board.penalty_tiles.length;
  const penaltyBefore = PENALTY_TOTALS[slotsUsed];
  if (takesToken && slotsUsed < PENALTY_ROW_SIZE) slotsUsed += 1;

  let placed: number;
  let overflow: number;
  if (action.dest === PENALTY_DEST) {
    placed = 0;
    overflow = count;
  } else {
    const room = STAGING_CAPACITY[action.dest] - board.staging_counts[action.dest];
    placed = Math.min(count, room);
    overflow = count - placed;
  }

  const free = PENALTY_ROW_SIZE - slotsUsed;
  const ontoRow = Math.min(overflow, free);

  return {
    count,
    placed,
    overflow,
    to_discard: overflow - ontoRow,
    takes_token: takesToken,
    penalty_before: penaltyBefore,
    penalty_after: PENALTY_TOTALS[slotsUsed + ontoRow],
  };
}

// ---------------------------------------------------------------- apply/undo

export interface Undo {
  action: Action;
  current: number;
  display_before: number[] | null;
  center_before: number[];
  center_has_token: boolean;
  player: number;
  staging_color: number;
  staging_count: number;
  penalty_tiles: number[];
  penalty_overflow: number;
  discard_before: number[];
  has_first_token: boolean;
  event: Draft;
}

/** Apply `action` for `state.current`. Does not settle the round. */
export function applyAction(state: GameState, action: Action): Undo {
  const player = state.current;
  const board = state.players[player];

  const undo: Undo = {
    action,
    current: player,
    display_before: action.source === CENTER ? null : state.displays[action.source].slice(),
    center_before: state.center.slice(),
    center_has_token: state.center_has_token,
    player,
    staging_color: action.dest !== PENALTY_DEST ? board.staging_colors[action.dest] : -1,
    staging_count: action.dest !== PENALTY_DEST ? board.staging_counts[action.dest] : 0,
    penalty_tiles: board.penalty_tiles.slice(),
    penalty_overflow: board.penalty_overflow,
    discard_before: state.discard.slice(),
    has_first_token: board.has_first_token,
    event: undefined as unknown as Draft,
  };

  const color = action.color;
  let count: number;
  let tookToken = false;

  if (action.source === CENTER) {
    count = state.center[color];
    state.center[color] = 0;
    if (state.center_has_token) {
      state.center_has_token = false;
      board.has_first_token = true;
      tookToken = true;
      // The token occupies a penalty slot; if the row is already full it costs
      // nothing but the player still leads the next round.
      if (board.penalty_tiles.length < PENALTY_ROW_SIZE) board.penalty_tiles.push(FIRST_TOKEN);
    }
  } else {
    const display = state.displays[action.source];
    count = display[color];
    display[color] = 0;
    for (let other = 0; other < NUM_COLORS; other += 1) {
      if (display[other]) {
        state.center[other] += display[other];
        display[other] = 0;
      }
    }
  }

  // Place the tiles: staging row first, remainder onto the penalty row.
  let placed: number;
  let overflow: number;
  if (action.dest === PENALTY_DEST) {
    placed = 0;
    overflow = count;
  } else {
    const row = action.dest;
    const room = STAGING_CAPACITY[row] - board.staging_counts[row];
    placed = count < room ? count : room;
    overflow = count - placed;
    if (placed) {
      board.staging_colors[row] = color;
      board.staging_counts[row] += placed;
    }
  }

  let toDiscard = 0;
  for (let i = 0; i < overflow; i += 1) {
    if (board.penalty_tiles.length < PENALTY_ROW_SIZE) {
      board.penalty_tiles.push(color);
    } else {
      board.penalty_overflow += 1;
      state.discard[color] += 1;
      toDiscard += 1;
    }
  }

  state.current = 1 - player;

  undo.event = {
    kind: 'draft',
    player,
    source: action.source,
    color,
    count,
    dest: action.dest,
    placed,
    overflow: overflow - toDiscard,
    to_discard: toDiscard,
    took_first_token: tookToken,
  };
  return undo;
}

export function undoAction(state: GameState, undo: Undo): void {
  if (undo.display_before !== null) {
    state.displays[undo.action.source] = undo.display_before.slice();
  }
  state.center = undo.center_before.slice();
  state.center_has_token = undo.center_has_token;
  state.discard = undo.discard_before.slice();
  const board = state.players[undo.player];
  if (undo.action.dest !== PENALTY_DEST) {
    board.staging_colors[undo.action.dest] = undo.staging_color;
    board.staging_counts[undo.action.dest] = undo.staging_count;
  }
  board.penalty_tiles = undo.penalty_tiles.slice();
  board.penalty_overflow = undo.penalty_overflow;
  board.has_first_token = undo.has_first_token;
  state.current = undo.current;
}

// ---------------------------------------------------------------- scoring

/**
 * Points for the tile just set at (row, col); returns [points, H, V].
 *
 * A run of length 1 in a direction scores nothing on its own; a tile with no
 * neighbors at all scores 1.
 */
export function scorePlacement(
  grid: boolean[][],
  row: number,
  col: number,
): [number, number, number] {
  let h = 1;
  for (let c = col - 1; c >= 0 && grid[row][c]; c -= 1) h += 1;
  for (let c = col + 1; c < GRID_SIZE && grid[row][c]; c += 1) h += 1;

  let v = 1;
  for (let r = row - 1; r >= 0 && grid[r][col]; r -= 1) v += 1;
  for (let r = row + 1; r < NUM_ROWS && grid[r][col]; r += 1) v += 1;

  let points = (h > 1 ? h : 0) + (v > 1 ? v : 0);
  if (points === 0) points = 1;
  return [points, h, v];
}

/**
 * Move completed staging rows onto the grid, score them, apply penalties.
 *
 * Players settle in fixed order 0 then 1 so the event stream is deterministic.
 * Rows settle top to bottom because a tile placed on an earlier row can extend
 * the vertical run of a tile placed on a later one.
 */
export function settleRound(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];

  state.players.forEach((board, player) => {
    for (let row = 0; row < NUM_ROWS; row += 1) {
      if (board.staging_counts[row] !== STAGING_CAPACITY[row]) continue;
      const color = board.staging_colors[row];
      const col = GRID_COL[row][color];
      board.grid[row][col] = true;
      const [points, h, v] = scorePlacement(board.grid, row, col);
      board.score += points;
      state.discard[color] += STAGING_CAPACITY[row] - 1;
      board.staging_colors[row] = -1;
      board.staging_counts[row] = 0;
      events.push({
        kind: 'tile_scored',
        player, row, col, color, points, horizontal: h, vertical: v,
      });
    }

    const tiles = board.penalty_tiles.length;
    if (tiles || board.penalty_overflow) {
      const points = PENALTY_TOTALS[tiles];
      board.score = Math.max(0, board.score + points);
      for (const tile of board.penalty_tiles) {
        if (tile !== FIRST_TOKEN) state.discard[tile] += 1;
      }
      board.penalty_tiles.length = 0;
      board.penalty_overflow = 0;
      events.push({
        kind: 'penalty', player, tiles, points, score_after: board.score,
      });
    }
  });

  events.push({
    kind: 'round_end',
    round_num: state.round_num,
    scores: state.players.map((p) => p.score),
  });

  if (state.players.some((p) => p.hasCompleteRow())) {
    state.phase = GAME_OVER;
    events.push(...finalScoring(state));
  }
  return events;
}

/** End-of-game bonuses and the result event. */
export function finalScoring(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  state.players.forEach((board, player) => {
    const rows = board.completeRows();
    const cols = board.completeColumns();
    const colors = board.completeColors();
    const points = rows * BONUS_ROW + cols * BONUS_COLUMN + colors * BONUS_COLOR;
    board.score = Math.max(0, board.score + points);
    events.push({ kind: 'bonus', player, rows, columns: cols, colors, points });
  });

  const [winner, draw] = decideWinner(state);
  events.push({
    kind: 'game_end',
    scores: state.players.map((p) => p.score),
    winner,
    draw,
  });
  return events;
}

/** Highest score wins; ties break on completed rows, then it is a draw. */
export function decideWinner(state: GameState): [number | null, boolean] {
  const [a, b] = state.players;
  if (a.score !== b.score) return a.score > b.score ? [0, false] : [1, false];
  const ra = a.completeRows();
  const rb = b.completeRows();
  if (ra !== rb) return ra > rb ? [0, false] : [1, false];
  return [null, true];
}
