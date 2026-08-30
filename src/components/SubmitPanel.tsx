/**
 * What happens after a Daily ends (§9.3 "Submission").
 *
 * A loss or a draw shows no submit affordance at all and issues no request
 * (AC-015, AC-016).
 */

import { SignInButton } from '@clerk/clerk-react';

import { clerkConfigured } from '../auth/clerk';
import type { SubmissionState } from '../game/useSubmission';
import { formatElapsed } from './Timer';

export function SubmitPanel({
  admissible,
  elapsedMs,
  opponentLabel = 'opponent',
  state,
  onRetry,
  onDiscard,
  onPlayAgain,
}: {
  admissible: boolean;
  elapsedMs: number;
  opponentLabel?: string;
  state: SubmissionState;
  onRetry: () => void;
  onDiscard: () => void;
  onPlayAgain: () => void;
}) {
  if (!admissible) {
    return (
      <div className="rounded-xl border border-neutral-800 p-3">
        <p className="text-sm text-neutral-300">
          Only a win counts for the board. Nothing was recorded.
        </p>
        <PlayAgain onPlayAgain={onPlayAgain} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-3">
      <p className="text-sm">
        You beat {opponentLabel} in{' '}
        <span className="font-mono font-semibold text-sky-300">{formatElapsed(elapsedMs)}</span>.
      </p>

      <div className="mt-2 text-sm text-neutral-300">
        {state.kind === 'submitting' && <p>Posting your score…</p>}

        {state.kind === 'awaiting-auth' && (
          <div className="flex flex-wrap items-center gap-2">
            <span>Sign in to post your score.</span>
            {clerkConfigured ? (
              <SignInButton mode="modal">
                <button type="button" className="rounded bg-sky-600 px-3 py-1 hover:bg-sky-500">
                  Sign in
                </button>
              </SignInButton>
            ) : (
              <span className="text-xs text-neutral-500">Sign-in unavailable.</span>
            )}
            <button
              type="button"
              onClick={onDiscard}
              className="rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-800"
            >
              No thanks
            </button>
          </div>
        )}

        {state.kind === 'posted' && (
          <p>
            New personal best — <span className="font-semibold text-sky-300">rank {state.rank}</span>{' '}
            of {state.totalEntries} today.
          </p>
        )}

        {state.kind === 'not-improved' && (
          <p>
            Not higher than your previous best margin, so the board keeps your existing record.
          </p>
        )}

        {state.kind === 'failed' && (
          <div>
            <p role="alert">{state.message}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-800"
            >
              Try again
            </button>
          </div>
        )}

        {state.kind === 'discarded' && <p>Not posted.</p>}
      </div>

      <PlayAgain onPlayAgain={onPlayAgain} />
    </div>
  );
}

function PlayAgain({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlayAgain}
      className="mt-3 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
    >
      Play again
    </button>
  );
}
