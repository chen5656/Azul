/**
 * What happens after a Daily ends (§9.3 "Submission").
 *
 * A loss or a draw shows no submit affordance at all and issues no request
 * (AC-015, AC-016).
 */

import type { ReactNode } from 'react';

import { useIdentity } from '../auth';
import type { SubmissionState } from '../game/useSubmission';
import { formatElapsed } from './Timer';

export function SubmitPanel({
  admissible = true,
  unrankedReason,
  unrankedAction,
  humanWon,
  draw,
  elapsedMs,
  opponentLabel = 'opponent',
  state,
  onRetry,
  onDiscard,
  onPlayAgain,
  children,
}: {
  admissible?: boolean;
  /** Shown instead of the rank when `admissible` is false. */
  unrankedReason?: string;
  /** The way out of an unranked game — a control, not just an explanation. */
  unrankedAction?: ReactNode;
  humanWon?: boolean;
  draw?: boolean;
  elapsedMs: number;
  opponentLabel?: string;
  state: SubmissionState;
  onRetry: () => void;
  onDiscard: () => void;
  onPlayAgain: () => void;
  /** The share control; rendered for every outcome, win or loss. */
  children?: ReactNode;
}) {
  if (!admissible) {
    return (
      <div className="rounded-xl border border-amber-600/70 bg-amber-950/30 p-3">
        <p className="text-sm">
          {draw
            ? `Game tied vs ${opponentLabel}`
            : humanWon
              ? `You beat ${opponentLabel}`
              : `${opponentLabel} won`}{' '}
          in{' '}
          <span className="font-mono font-semibold text-neutral-300">
            {formatElapsed(elapsedMs)}
          </span>
          .
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-100/90">
          <span className="rounded-full border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Not ranked
          </span>
          {unrankedReason ?? 'Nothing was recorded.'}
        </p>
        {unrankedAction}
        {/* The game is still worth sharing even when it is not worth ranking. */}
        {children}
        <PlayAgain onPlayAgain={onPlayAgain} />
      </div>
    );
  }

  const outcomeText = draw
    ? `Game tied vs ${opponentLabel}`
    : humanWon
      ? `You beat ${opponentLabel}`
      : `${opponentLabel} won`;

  return (
    <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-3">
      <p className="text-sm">
        {outcomeText} in{' '}
        <span className="font-mono font-semibold text-sky-300">{formatElapsed(elapsedMs)}</span>.
      </p>

      <div className="mt-2 text-sm text-neutral-300">
        {state.kind === 'submitting' && <p>Posting your score…</p>}

        {state.kind === 'awaiting-auth' && <AwaitingAuth onDiscard={onDiscard} />}

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

      {children}

      <PlayAgain onPlayAgain={onPlayAgain} />
    </div>
  );
}

/**
 * The one thing sign-in gates. "Just start playing" in the dialog makes an
 * anonymous account, so this is a tap away from posted, not a signup wall.
 */
function AwaitingAuth({ onDiscard }: { onDiscard: () => void }) {
  const identity = useIdentity();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>Sign in to post your score.</span>
      <button
        type="button"
        onClick={identity.openSignIn}
        className="rounded bg-sky-600 px-3 py-1 hover:bg-sky-500"
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-800"
      >
        No thanks
      </button>
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
