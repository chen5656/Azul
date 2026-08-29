/**
 * The submission state machine from §7.2.
 *
 * An attempt lives in memory only. Nothing is queued to disk, and a failed
 * submission is discarded on unload (D-020, FR-032).
 */

import { useCallback, useRef, useState } from 'react';

import {
  ApiError,
  CLIENT_VERSION,
  type ScoreSubmission,
  postScore,
  withBackoff,
} from '../api/client';
import type { Identity } from '../auth/clerk';

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
      let token = await identity.getToken();
      if (!token) {
        setState({ kind: 'awaiting-auth' });
        return;
      }

      let result;
      try {
        result = await withBackoff(() => postScore(attempt, token!));
      } catch (err) {
        // An expired session gets exactly one refresh-and-retry (§15).
        if (err instanceof ApiError && err.status === 401) {
          token = await identity.getToken();
          if (!token) {
            setState({ kind: 'awaiting-auth' });
            return;
          }
          result = await postScore(attempt, token);
        } else {
          throw err;
        }
      }

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
      const apiError = err instanceof ApiError ? err : null;
      setState({
        kind: 'failed',
        code: apiError?.code ?? 'INTERNAL',
        message: explain(apiError),
      });
    }
  }, [identity]);

  const submit = useCallback(
    async (attempt: Omit<ScoreSubmission, 'client_version'>) => {
      held.current = { ...attempt, client_version: CLIENT_VERSION };
      if (!identity.signedIn) {
        setState({ kind: 'awaiting-auth' });
        return;
      }
      await send();
    },
    [identity.signedIn, send],
  );

  const discard = useCallback(() => {
    held.current = null;
    setState({ kind: 'discarded' });
  }, []);

  const reset = useCallback(() => {
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
