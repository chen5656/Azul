/**
 * The submission state machine from §7.2.
 *
 * An attempt lives in memory only. Nothing is queued to disk, and a failed
 * submission is discarded on unload (D-020, FR-032). The single exception is an
 * attempt waiting on sign-in, which is kept in sessionStorage so a provider
 * redirect does not swallow it; see `pendingSubmission`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  CLIENT_VERSION,
  type ScoreSubmission,
  postScore,
  withBackoff,
} from '../api/client';
import type { Identity } from '../auth';
import { clearPending, loadPending, savePending } from './pendingSubmission';

export type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'awaiting-auth' }
  | { kind: 'submitting' }
  | { kind: 'posted'; rank: number; elapsedMs: number; totalEntries: number }
  | { kind: 'not-improved'; bestElapsedMs: number }
  | { kind: 'failed'; message: string; code: string }
  | { kind: 'discarded' };

export interface Submitter {
  state: SubmissionState;
  /** Offer the attempt. Prompts for sign-in when anonymous (FR-028). */
  submit: (attempt: Omit<ScoreSubmission, 'client_version'>) => Promise<void>;
  /** Retry the attempt held in memory (FR-032). */
  retry: () => Promise<void>;
  discard: () => void;
  reset: () => void;
}

export function useSubmission(identity: Identity): Submitter {
  const [state, setState] = useState<SubmissionState>({ kind: 'idle' });
  const held = useRef<ScoreSubmission | null>(null);

  const send = useCallback(async () => {
    const attempt = held.current;
    if (!attempt) return;

    setState({ kind: 'submitting' });
    try {
      let result;
      try {
        result = await withBackoff(() => postScore(attempt));
      } catch (err) {
        // The session cookie is gone or expired: there is nothing to refresh
        // client-side, so ask for a sign-in and keep the attempt in memory.
        if (err instanceof ApiError && err.status === 401) {
          savePending(attempt);
          setState({ kind: 'awaiting-auth' });
          return;
        }
        throw err;
      }

      clearPending();
      setState(
        result.improved
          ? {
              kind: 'posted',
              rank: result.rank,
              elapsedMs: result.best_elapsed_ms,
              totalEntries: result.total_entries,
            }
          : { kind: 'not-improved', bestElapsedMs: result.best_elapsed_ms },
      );
    } catch (err) {
      // A failure is retryable from memory, but it is no longer waiting on a
      // sign-in redirect, so nothing should outlive this page.
      clearPending();
      const apiError = err instanceof ApiError ? err : null;
      setState({
        kind: 'failed',
        code: apiError?.code ?? 'INTERNAL',
        message: explain(apiError),
      });
    }
  }, []);

  const submit = useCallback(
    async (attempt: Omit<ScoreSubmission, 'client_version'>) => {
      const full = { ...attempt, client_version: CLIENT_VERSION };
      held.current = full;
      if (!identity.signedIn) {
        savePending(full);
        setState({ kind: 'awaiting-auth' });
        return;
      }
      await send();
    },
    [identity.signedIn, send],
  );

  /**
   * Sign-in is the one thing that gates a post, so completing it has to finish
   * the attempt the player was already holding. Without this the score sits in
   * `awaiting-auth` forever and never reaches the board (the sign-in dialog
   * closes with nothing to show for it).
   */
  useEffect(() => {
    if (!identity.signedIn) return;
    if (state.kind !== 'awaiting-auth') return;
    if (!held.current) return;
    void send();
  }, [identity.signedIn, state.kind, send]);

  /**
   * A sign-in that redirected away lands back here on a fresh page with the
   * attempt only in sessionStorage. Pick it up so the effect above can post it.
   */
  useEffect(() => {
    if (held.current) return;
    const pending = loadPending();
    if (!pending) return;
    held.current = pending;
    setState((current) => (current.kind === 'idle' ? { kind: 'awaiting-auth' } : current));
  }, []);

  const discard = useCallback(() => {
    clearPending();
    held.current = null;
    setState({ kind: 'discarded' });
  }, []);

  const reset = useCallback(() => {
    clearPending();
    held.current = null;
    setState({ kind: 'idle' });
  }, []);

  return { state, submit, retry: send, discard, reset };
}

/** Turns an API error code into something a player can act on (§15). */
function explain(error: ApiError | null): string {
  switch (error?.code) {
    case 'OFFLINE':
      return "You're offline, so this time can't be recorded right now.";
    case 'STALE_PUZZLE':
      return "This attempt belongs to yesterday's puzzle, so it can't be posted.";
    case 'IMPLAUSIBLE_TIME':
      return 'The server rejected this time as implausible.';
    case 'INVALID_PAYLOAD':
      return 'The server rejected this attempt as malformed.';
    case 'RATE_LIMITED':
      return "You've submitted a lot in the last hour. Try again shortly.";
    case 'UNAUTHENTICATED':
      return 'Your session expired. Sign in again to post this time.';
    default:
      return error?.message ?? 'Something went wrong posting your time.';
  }
}
