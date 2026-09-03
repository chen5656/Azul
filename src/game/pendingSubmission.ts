/**
 * The one attempt that survives a page load: the score a player finished while
 * signed out, held across the sign-in round-trip.
 *
 * D-020 keeps unsent scores off disk, and this stays inside that rule as
 * narrowly as it can. A social sign-in *leaves the page* (`signIn.social`
 * redirects to the provider and back), so an in-memory attempt is gone by the
 * time the player is authenticated and the score they just played never
 * reaches the board. The record lives in sessionStorage — same tab, cleared
 * when it closes — and is dropped as soon as it is posted, discarded, or stale.
 */

import type { ScoreSubmission } from '../api/client';

const KEY = 'quadro.v1.pendingScore';

/** Long enough for a provider round-trip, short enough to never post a surprise. */
const MAX_AGE_MS = 30 * 60 * 1000;

interface Stored {
  savedAt: number;
  attempt: ScoreSubmission;
}

export function savePending(attempt: ScoreSubmission): void {
  try {
    const record: Stored = { savedAt: Date.now(), attempt };
    window.sessionStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // A blocked or full store costs this player the redirect recovery and
    // nothing else; the in-memory path still works.
  }
}

export function clearPending(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the reader treats anything unparseable or stale as absent.
  }
}

/** The held attempt, or null when there is none, it is stale, or it is junk. */
export function loadPending(): ScoreSubmission | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let record: Stored;
  try {
    record = JSON.parse(raw) as Stored;
  } catch {
    clearPending();
    return null;
  }

  const attempt = record?.attempt;
  const fresh = typeof record?.savedAt === 'number' && Date.now() - record.savedAt < MAX_AGE_MS;
  if (!fresh || !attempt || typeof attempt.puzzle_id !== 'string') {
    clearPending();
    return null;
  }
  return attempt;
}
