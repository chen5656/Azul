/**
 * Core mutable state for Quadro, plus JSON-lossless serialization.
 *
 * Port of `backend/engine/state.py`. The bag holds per-color *counts* rather
 * than a shuffled sequence: the composition of the bag is public knowledge
 * anyway, only the draw order is random, so weighted draws are equivalent and
 * the state stays compact.
 */

import {
  CENTER,
  COLOR_BY_NAME,
  COLOR_NAMES,
  FIRST_TOKEN,
  GRID_COL,
  GRID_COLOR,
  GRID_SIZE,
  NUM_COLORS,
  NUM_DESTS,
  NUM_DISPLAYS,
  NUM_PLAYERS,
  NUM_ROWS,
  PENALTY_DEST,
  PENALTY_TOTALS,
  TILES_PER_COLOR,
} from './constants';
import { Rng } from './rng';

export const DRAFTING = 'drafting';
export const GAME_OVER = 'game_over';
export type Phase = typeof DRAFTING | typeof GAME_OVER;

export class Action {
  constructor(
    readonly source: number, // 0..4 display, 5 center
    readonly color: number, // 0..4
    readonly dest: number, // 0..4 staging row, 5 penalty row
  ) {}

  get actionId(): number {
    return (this.source * NUM_COLORS + this.color) * NUM_DESTS + this.dest;
  }

  static fromId(actionId: number): Action {
    const dest = actionId % NUM_DESTS;
    const rest = Math.floor(actionId / NUM_DESTS);
    return new Action(Math.floor(rest / NUM_COLORS), rest % NUM_COLORS, dest);
  }

  equals(other: Action): boolean {
    return (
      this.source === other.source && this.color === other.color && this.dest === other.dest
    );
  }

  toDict(): Record<string, unknown> {
    return {
      source: this.source,
      color: COLOR_NAMES[this.color],
      dest: this.dest,
      action_id: this.actionId,
    };
  }

  static fromDict(d: Record<string, unknown>): Action {
    const raw = d.color;
    const color = typeof raw === 'string' ? COLOR_BY_NAME[raw] : (raw as number);
    return new Action(d.source as number, color, d.dest as number);
  }

  describe(): string {
    const src = this.source === CENTER ? 'center' : `D${this.source}`;
    const dst = this.dest === PENALTY_DEST ? 'penalty' : `row ${this.dest + 1}`;
    return `${src} ${COLOR_NAMES[this.color]} -> ${dst}`;
  }
}

export class PlayerBoard {
  staging_colors: number[] = new Array(NUM_ROWS).fill(-1);
  staging_counts: number[] = new Array(NUM_ROWS).fill(0);
  grid: boolean[][] = Array.from({ length: NUM_ROWS }, () =>
    new Array(GRID_SIZE).fill(false),
  );
  penalty_tiles: number[] = [];
  penalty_overflow = 0;
  score = 0;
  has_first_token = false;

  clone(): PlayerBoard {
    const copy = new PlayerBoard();
    copy.staging_colors = this.staging_colors.slice();
    copy.staging_counts = this.staging_counts.slice();
    copy.grid = this.grid.map((row) => row.slice());
    copy.penalty_tiles = this.penalty_tiles.slice();
    copy.penalty_overflow = this.penalty_overflow;
    copy.score = this.score;
    copy.has_first_token = this.has_first_token;
    return copy;
  }

  /** Points the penalty row would subtract right now (negative or zero). */
  penaltyTotal(): number {
    return PENALTY_TOTALS[this.penalty_tiles.length];
  }

  completeRows(): number {
    let n = 0;
    for (const row of this.grid) if (row.every(Boolean)) n += 1;
    return n;
  }

  completeColumns(): number {
    let n = 0;
    for (let c = 0; c < GRID_SIZE; c += 1) {
      let full = true;
      for (let r = 0; r < NUM_ROWS; r += 1) if (!this.grid[r][c]) { full = false; break; }
      if (full) n += 1;
    }
    return n;
  }

  completeColors(): number {
    let n = 0;
    for (let color = 0; color < NUM_COLORS; color += 1) {
      let full = true;
      for (let r = 0; r < NUM_ROWS; r += 1) {
        if (!this.grid[r][GRID_COL[r][color]]) { full = false; break; }
      }
      if (full) n += 1;
    }
    return n;
  }

  hasCompleteRow(): boolean {
    return this.grid.some((row) => row.every(Boolean));
  }

  toDict(): Record<string, unknown> {
    return {
      staging_colors: this.staging_colors.map((c) => (c < 0 ? null : COLOR_NAMES[c])),
      staging_counts: this.staging_counts.slice(),
      grid: this.grid.map((row) => row.slice()),
      penalty_tiles: this.penalty_tiles.map((t) =>
        t === FIRST_TOKEN ? 'first_token' : COLOR_NAMES[t],
      ),
      penalty_overflow: this.penalty_overflow,
      score: this.score,
      has_first_token: this.has_first_token,
    };
  }

  static fromDict(d: Record<string, any>): PlayerBoard {
    const board = new PlayerBoard();
    board.staging_colors = d.staging_colors.map((c: string | null) =>
      c === null ? -1 : COLOR_BY_NAME[c],
    );
    board.staging_counts = Array.from(d.staging_counts as number[]);
    board.grid = (d.grid as unknown[][]).map((row) => row.map(Boolean));
    board.penalty_tiles = (d.penalty_tiles as string[]).map((t) =>
      t === 'first_token' ? FIRST_TOKEN : COLOR_BY_NAME[t],
    );
    board.penalty_overflow = d.penalty_overflow;
    board.score = d.score;
    board.has_first_token = d.has_first_token;
    return board;
  }
}

export class GameState {
  displays: number[][] = Array.from({ length: NUM_DISPLAYS }, () =>
    new Array(NUM_COLORS).fill(0),
  );
  center: number[] = new Array(NUM_COLORS).fill(0);
  center_has_token = true;
  bag: number[] = new Array(NUM_COLORS).fill(TILES_PER_COLOR);
  discard: number[] = new Array(NUM_COLORS).fill(0);
  players: PlayerBoard[] = Array.from({ length: NUM_PLAYERS }, () => new PlayerBoard());
  current = 0;
  /** who started this round; the fallback if nobody takes the token */
  first_player = 0;
  round_num = 1;
  phase: Phase = DRAFTING;
  rng: Rng;

  constructor(rng: Rng = new Rng()) {
    this.rng = rng;
  }

  // ---- convenience -------------------------------------------------

  sourceCounts(source: number): number[] {
    return source === CENTER ? this.center : this.displays[source];
  }

  /** True when no tiles remain to be taken (the first token does not count). */
  draftingDone(): boolean {
    if (this.center.some((n) => n > 0)) return false;
    return !this.displays.some((d) => d.some((n) => n > 0));
  }

  /** Per-color count of every tile in the game; used by invariant checks. */
  tileCensus(): number[] {
    const total = new Array(NUM_COLORS).fill(0);
    for (let color = 0; color < NUM_COLORS; color += 1) {
      total[color] += this.bag[color] + this.discard[color] + this.center[color];
      for (const d of this.displays) total[color] += d[color];
    }
    for (const board of this.players) {
      for (let row = 0; row < NUM_ROWS; row += 1) {
        if (board.staging_colors[row] >= 0) {
          total[board.staging_colors[row]] += board.staging_counts[row];
        }
      }
      for (const tile of board.penalty_tiles) {
        if (tile !== FIRST_TOKEN) total[tile] += 1;
      }
      for (let r = 0; r < NUM_ROWS; r += 1) {
        for (let c = 0; c < GRID_SIZE; c += 1) {
          if (board.grid[r][c]) total[GRID_COLOR[r][c]] += 1;
        }
      }
    }
    return total;
  }

  clone(): GameState {
    const copy = new GameState(this.rng.clone());
    copy.displays = this.displays.map((d) => d.slice());
    copy.center = this.center.slice();
    copy.center_has_token = this.center_has_token;
    copy.bag = this.bag.slice();
    copy.discard = this.discard.slice();
    copy.players = this.players.map((p) => p.clone());
    copy.current = this.current;
    copy.first_player = this.first_player;
    copy.round_num = this.round_num;
    copy.phase = this.phase;
    return copy;
  }

  // ---- serialization -----------------------------------------------

  /**
   * Wire form. `includeRng` defaults to false because the parity vectors are
   * RNG-independent and the Python reference stores an incompatible MT state.
   */
  toDict(includeRng = false): Record<string, unknown> {
    const sparse = (counts: number[]): Record<string, number> => {
      const out: Record<string, number> = {};
      counts.forEach((n, c) => { if (n) out[COLOR_NAMES[c]] = n; });
      return out;
    };
    const dense = (counts: number[]): Record<string, number> => {
      const out: Record<string, number> = {};
      counts.forEach((n, c) => { out[COLOR_NAMES[c]] = n; });
      return out;
    };
    const d: Record<string, unknown> = {
      displays: this.displays.map(sparse),
      center: sparse(this.center),
      center_has_token: this.center_has_token,
      bag: dense(this.bag),
      discard: dense(this.discard),
      players: this.players.map((p) => p.toDict()),
      current: this.current,
      first_player: this.first_player,
      round_num: this.round_num,
      phase: this.phase,
    };
    if (includeRng) d.rng = this.rng.state;
    return d;
  }

  static fromDict(d: Record<string, any>): GameState {
    const counts = (mapping: Record<string, number>): number[] => {
      const out = new Array(NUM_COLORS).fill(0);
      for (const [name, n] of Object.entries(mapping)) out[COLOR_BY_NAME[name]] = n;
      return out;
    };
    const state = new GameState(
      new Rng(typeof d.rng === 'number' ? d.rng : 0),
    );
    state.displays = (d.displays as Record<string, number>[]).map(counts);
    state.center = counts(d.center);
    state.center_has_token = d.center_has_token;
    state.bag = counts(d.bag);
    state.discard = counts(d.discard);
    state.players = (d.players as Record<string, any>[]).map(PlayerBoard.fromDict);
    state.current = d.current;
    state.first_player = d.first_player ?? 0;
    state.round_num = d.round_num;
    state.phase = d.phase;
    return state;
  }
}
