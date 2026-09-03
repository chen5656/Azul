/**
 * The Daily puzzle: which day it is, and what deal that day gets.
 *
 * BUILD-SPEC §8. The day boundary is midnight America/New_York, DST-aware
 * (D-008), and the seed is derived from the date string so every device
 * generates the same starting position (FR-016).
 */

import { QuadroGame, fnv1a32 } from '../engine';

/** Bumping this regenerates the whole deal set without colliding with posted times. */
export const PUZZLE_NAMESPACE = 'quadro-daily-v1:';

export const DAILY_TIME_ZONE = 'America/New_York';

/** The human always takes seat 0 and moves first (A-001, BR-003). */
export const HUMAN_SEAT = 0;

/**
 * The first day that has a board — launch day. Browsing back stops here rather
 * than at an arbitrary date, so the date picker cannot wander into days that
 * were never played and show a permanently empty board.
 */
export const FIRST_PUZZLE_ID = '2026-09-02';

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: DAILY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today's `puzzle_id` in New York, as `YYYY-MM-DD`.
 *
 * `en-CA` formats as `YYYY-MM-DD` directly and the formatter applies the zone's
 * real DST rules, so this is never computed from a fixed UTC offset.
 */
export function puzzleIdFor(at: Date = new Date()): string {
  return DATE_FORMAT.format(at);
}

/** `seed = fnv1a32("quadro-daily-v1:" + puzzle_id)` (BR-002). */
export function seedForPuzzle(puzzleId: string): number {
  return fnv1a32(PUZZLE_NAMESPACE + puzzleId);
}

/**
 * The instant the New York day rolls over, as epoch milliseconds.
 *
 * Found by bisecting on the formatted date rather than by arithmetic on an
 * offset, so spring-forward and fall-back days need no special case.
 */
export function nextRolloverMs(at: Date = new Date()): number {
  const today = puzzleIdFor(at);
  let lo = at.getTime();
  let hi = lo + 36 * 3600 * 1000; // a day plus slack, always past the boundary
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (puzzleIdFor(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * The day's game, dealt and ready for the human's first move.
 *
 * The human is seat 0 and moves first, so the usual random draw for the starting
 * seat is skipped (A-001).
 */
/** `puzzleId` shifted by `days`, clamped to [FIRST_PUZZLE_ID, today]. */
export function shiftPuzzleId(puzzleId: string, days: number, today = puzzleIdFor()): string {
  const [y, m, d] = puzzleId.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  if (next < FIRST_PUZZLE_ID) return FIRST_PUZZLE_ID;
  return next > today ? today : next;
}

export function isPlayablePuzzleId(puzzleId: string, today = puzzleIdFor()): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(puzzleId) &&
    puzzleId >= FIRST_PUZZLE_ID &&
    puzzleId <= today
  );
}

export function newDailyGame(puzzleId: string): QuadroGame {
  return new QuadroGame(seedForPuzzle(puzzleId), HUMAN_SEAT);
}
