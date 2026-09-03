/**
 * Structured events emitted by the engine.
 *
 * The engine never logs. It returns events, and the UI, the replay file and the
 * parity vectors all render the same stream. Serialized shapes match
 * `backend/engine/events.py` exactly: `color` becomes a color name, and `kind`
 * is the discriminator.
 */

import { COLOR_WIRE_NAMES } from './constants';

export interface Draft {
  kind: 'draft';
  player: number;
  source: number;
  color: number;
  count: number;
  dest: number;
  /** tiles that landed on the staging row */
  placed: number;
  /** tiles that landed on the penalty row */
  overflow: number;
  /** tiles that fell off the end of a full penalty row */
  to_discard: number;
  took_first_token: boolean;
}

export interface TileScored {
  kind: 'tile_scored';
  player: number;
  row: number;
  col: number;
  color: number;
  points: number;
  horizontal: number;
  vertical: number;
}

export interface PenaltyApplied {
  kind: 'penalty';
  player: number;
  tiles: number;
  /** negative or zero, before clamping the score at 0 */
  points: number;
  score_after: number;
}

export interface RoundEnd {
  kind: 'round_end';
  round_num: number;
  scores: number[];
}

export interface RoundStart {
  kind: 'round_start';
  round_num: number;
  first_player: number;
  bag_refilled: boolean;
  /** displays that could not be filled to 4 (bag and discard both empty) */
  short_displays: number;
}

export interface BonusAwarded {
  kind: 'bonus';
  player: number;
  rows: number;
  columns: number;
  colors: number;
  points: number;
}

export interface GameEnd {
  kind: 'game_end';
  scores: number[];
  winner: number | null;
  draw: boolean;
}

export type GameEvent =
  | Draft
  | TileScored
  | PenaltyApplied
  | RoundEnd
  | RoundStart
  | BonusAwarded
  | GameEnd;

/**
 * Wire form of an event. Mirrors the Python `Event.to_dict`: field order aside,
 * the only transformation is the int `color` becoming its name.
 */
export function eventToDict(event: GameEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { ...event };
  if (typeof out.color === 'number' && (out.color as number) >= 0) {
    out.color = COLOR_WIRE_NAMES[out.color as number];
  }
  return out;
}
