/**
 * The Worker's own view of which puzzle is current.
 *
 * Resolved independently of the client and treated as authoritative, so a
 * device with a skewed clock cannot post to the wrong day (BR-012, §15).
 */

import { fnv1a32 } from '../src/engine/rng';

export const DAILY_TIME_ZONE = 'America/New_York';
export const PUZZLE_NAMESPACE = 'quadro-daily-v1:';

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: DAILY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` in New York, DST-correct (D-008). */
export function currentPuzzleId(now: Date = new Date()): string {
  return DATE_FORMAT.format(now);
}

export function seedForPuzzle(puzzleId: string): number {
  return fnv1a32(PUZZLE_NAMESPACE + puzzleId);
}

/** Epoch ms of the next New York midnight, found by bisection so DST is free. */
export function nextRolloverMs(now: Date = new Date()): number {
  const today = currentPuzzleId(now);
  let lo = now.getTime();
  let hi = lo + 36 * 3600 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (currentPuzzleId(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function isPuzzleId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
