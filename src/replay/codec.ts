/**
 * Replay serialization: a whole game in ~90 bytes.
 *
 * The engine's only consumer of randomness is `drawTile`, driven by
 * `GameState.rng`; the agents search on clones carrying their own `Rng` and
 * never advance the live one (locked by `test/replay/invariant.test.ts`).
 * A game is therefore fully determined by its seed plus the ordered list of
 * actions.
 *
 * Both players' actions are recorded, including the agent's. The agents are
 * *nearly* deterministic — `src/ai/budget.ts` defines strength in units of
 * work rather than wall clock, so a seeded agent normally picks the same move
 * everywhere — but "nearly" is not good enough for a link that has to keep
 * working: a search that trips `AI_SAFETY_CAP_MS` on a slow device returns
 * early and diverges, and any future change to search order would break every
 * replay already shared. Replaying the recorded move removes the question.
 *
 * `Action.actionId` is `(source * 5 + color) * 6 + dest`, at most 179, so one
 * action is one byte and a five-round game fits in a URL fragment. Sharing
 * therefore needs no database and no account.
 *
 * Layout (then base64url, no padding):
 *
 *   0      format tag
 *   1      engine version (see `version.ts`)
 *   2      flags: bit0 first_player, bit1 human_seat, bits2-4 ai level, bit5 has date
 *   3..6   seed, uint32 LE
 *   7      claimed final score, seat 0
 *   8      claimed final score, seat 1
 *   9..10  days since 2025-01-01, uint16 LE   (only when bit5 is set)
 *   rest   one byte per action, in play order
 */

import { NUM_COLORS, NUM_DESTS } from '../engine';

export const REPLAY_FORMAT = 1;

/**
 * Level index is part of the wire format: append only, NEVER reorder. Both
 * `src/ai`'s `LEVELS` and the Worker's `AI_LEVELS` list the same six levels in
 * different orders, so neither can be used here.
 */
export const REPLAY_AI_LEVELS = [
  'easy',
  'medium',
  'hard',
  'expert',
  'master',
  'extreme',
] as const;
export type ReplayAiLevel = (typeof REPLAY_AI_LEVELS)[number];

/** Day 0 of the date field. Dates before this cannot be encoded. */
const DATE_EPOCH_MS = Date.UTC(2025, 0, 1);
const DAY_MS = 86_400_000;

/** 6 sources x 5 colors x 6 destinations. */
export const MAX_ACTION_ID = 6 * NUM_COLORS * NUM_DESTS - 1;

/** A hard cap, so a hostile URL cannot make the player run forever. */
export const MAX_ACTIONS = 400;

export interface Replay {
  engineVersion: number;
  seed: number;
  firstPlayer: number;
  humanSeat: number;
  aiLevel: ReplayAiLevel;
  /** Final scores as claimed by the encoder, checked during playback. */
  scores: [number, number];
  /** `YYYY-MM-DD` for a Daily attempt; null for Practice. */
  puzzleId: string | null;
  actions: number[];
}

export class ReplayDecodeError extends Error {
  constructor(
    readonly code:
      | 'MALFORMED'
      | 'BAD_FORMAT'
      | 'ENGINE_MISMATCH'
      | 'TOO_LONG',
    message: string,
    readonly foundVersion?: number,
  ) {
    super(message);
    this.name = 'ReplayDecodeError';
  }
}

// ---- base64url ------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new ReplayDecodeError('MALFORMED', 'Replay code contains invalid characters');
  }
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  let binary: string;
  try {
    binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  } catch {
    throw new ReplayDecodeError('MALFORMED', 'Replay code is not valid base64url');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---- dates ----------------------------------------------------------

/** `YYYY-MM-DD` -> days since 2025-01-01, or null when out of range. */
function encodeDate(puzzleId: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(puzzleId);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const days = Math.round((ms - DATE_EPOCH_MS) / DAY_MS);
  return days >= 0 && days <= 0xffff ? days : null;
}

function decodeDate(days: number): string {
  const d = new Date(DATE_EPOCH_MS + days * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ---- encode / decode ------------------------------------------------

export function encodeReplay(replay: Omit<Replay, 'engineVersion'> & { engineVersion: number }): string {
  const { actions } = replay;
  if (actions.length > MAX_ACTIONS) {
    throw new ReplayDecodeError('TOO_LONG', `A replay may hold at most ${MAX_ACTIONS} actions`);
  }
  for (const id of actions) {
    if (!Number.isInteger(id) || id < 0 || id > MAX_ACTION_ID) {
      throw new ReplayDecodeError('MALFORMED', `Action id out of range: ${id}`);
    }
  }

  const levelIndex = REPLAY_AI_LEVELS.indexOf(replay.aiLevel);
  if (levelIndex < 0) throw new ReplayDecodeError('MALFORMED', `Unknown level: ${replay.aiLevel}`);

  const days = replay.puzzleId === null ? null : encodeDate(replay.puzzleId);
  const header = days === null ? 9 : 11;
  const bytes = new Uint8Array(header + actions.length);
  const view = new DataView(bytes.buffer);

  bytes[0] = REPLAY_FORMAT;
  bytes[1] = replay.engineVersion & 0xff;
  bytes[2] =
    (replay.firstPlayer & 1) |
    ((replay.humanSeat & 1) << 1) |
    ((levelIndex & 0b111) << 2) |
    (days === null ? 0 : 1 << 5);
  view.setUint32(3, replay.seed >>> 0, true);
  // Scores are clamped, not wrapped: the field is a display/verification hint
  // and a 255+ score must not decode as a small one.
  bytes[7] = Math.max(0, Math.min(255, replay.scores[0]));
  bytes[8] = Math.max(0, Math.min(255, replay.scores[1]));
  if (days !== null) view.setUint16(9, days, true);
  bytes.set(actions, header);

  return toBase64Url(bytes);
}

export function decodeReplay(code: string, expectedEngineVersion: number): Replay {
  const bytes = fromBase64Url(code.trim());
  if (bytes.length < 9) {
    throw new ReplayDecodeError('MALFORMED', 'Replay code is too short');
  }
  if (bytes[0] !== REPLAY_FORMAT) {
    throw new ReplayDecodeError('BAD_FORMAT', `Unsupported replay format: ${bytes[0]}`);
  }

  const engineVersion = bytes[1];
  // Refused rather than played: a replay from another engine would silently
  // render a *different* game, which is worse than showing nothing.
  if (engineVersion !== expectedEngineVersion) {
    throw new ReplayDecodeError(
      'ENGINE_MISMATCH',
      `This replay was recorded by engine v${engineVersion}; this build plays v${expectedEngineVersion}`,
      engineVersion,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[2];
  const hasDate = (flags & (1 << 5)) !== 0;
  const header = hasDate ? 11 : 9;
  if (bytes.length < header) {
    throw new ReplayDecodeError('MALFORMED', 'Replay code is truncated');
  }
  if (bytes.length - header > MAX_ACTIONS) {
    throw new ReplayDecodeError('TOO_LONG', 'Replay holds more actions than a game can contain');
  }

  const levelIndex = (flags >> 2) & 0b111;
  const aiLevel = REPLAY_AI_LEVELS[levelIndex];
  if (aiLevel === undefined) {
    throw new ReplayDecodeError('MALFORMED', `Unknown level index: ${levelIndex}`);
  }

  const actions = Array.from(bytes.subarray(header));
  for (const id of actions) {
    if (id > MAX_ACTION_ID) {
      throw new ReplayDecodeError('MALFORMED', `Action id out of range: ${id}`);
    }
  }

  return {
    engineVersion,
    seed: view.getUint32(3, true),
    firstPlayer: flags & 1,
    humanSeat: (flags >> 1) & 1,
    aiLevel,
    scores: [bytes[7], bytes[8]],
    puzzleId: hasDate ? decodeDate(view.getUint16(9, true)) : null,
    actions,
  };
}
