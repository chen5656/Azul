/**
 * Today's global board (FR-033 … FR-038).
 *
 * Readable without signing in. Offline is a state, not an error, and never
 * blocks play (FR-037).
 */

import { useCallback, useEffect, useState } from 'react';

import { ApiError, type Leaderboard as Board, getLeaderboard } from '../api/client';
import { useIdentity } from '../auth/clerk';
import { formatElapsed } from './Timer';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; board: Board }
  | { kind: 'offline' }
  | { kind: 'failed'; message: string };

export function Leaderboard({
  puzzleId,
  /** Bump to refetch — the Daily does this after a successful submission. */
  refreshKey = 0,
}: {
  puzzleId: string;
  refreshKey?: number;
}) {
  const identity = useIdentity();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const token = (await identity.getToken()) ?? undefined;
      setState({ kind: 'ready', board: await getLeaderboard(puzzleId, token) });
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setState(
        apiError?.code === 'OFFLINE'
          ? { kind: 'offline' }
          : { kind: 'failed', message: apiError?.message ?? 'Could not load the board' },
      );
    }
    // identity.getToken is a fresh closure each render; the puzzle and the
    // refresh counter are what should actually trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="Leaderboard" className="rounded-xl border border-neutral-800 p-3">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Today's fastest wins</h2>
        <span className="text-xs text-neutral-500">{puzzleId}</span>
      </header>
      <Body state={state} onRetry={load} signedIn={identity.signedIn} />
    </section>
  );
}

function Body({
  state,
  onRetry,
  signedIn,
}: {
  state: State;
  onRetry: () => void;
  signedIn: boolean;
}) {
  if (state.kind === 'loading') {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (state.kind === 'offline') {
    return (
      <p className="text-sm text-neutral-400">
        Offline — scores aren't recorded right now. You can still play.
      </p>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div className="text-sm text-neutral-400">
        <p>{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
        >
          Try again
        </button>
      </div>
    );
  }

  const { board } = state;
  if (board.entries.length === 0) {
    return <p className="text-sm text-neutral-400">Nobody has beaten it yet today.</p>;
  }

  const meInList =
    board.me !== null && board.entries.some((entry) => entry.rank === board.me!.rank);

  return (
    <>
      <ol className="divide-y divide-neutral-800 text-sm">
        {board.entries.map((entry) => (
          <li
            key={entry.rank}
            className={`flex items-baseline gap-3 py-1.5 ${
              board.me?.rank === entry.rank ? 'text-sky-300' : ''
            }`}
          >
            <span className="w-8 tabular-nums text-neutral-500">{entry.rank}</span>
            <span className="min-w-0 flex-1 truncate">{entry.display_name}</span>
            <span className="tabular-nums text-neutral-400">{entry.final_score}</span>
            <span className="font-mono tabular-nums">{formatElapsed(entry.elapsed_ms)}</span>
          </li>
        ))}
      </ol>

      {board.me !== null && !meInList && (
        <div className="mt-2 border-t border-neutral-700 pt-2 text-sm text-sky-300">
          <div className="flex items-baseline gap-3">
            <span className="w-8 tabular-nums">{board.me.rank}</span>
            <span className="flex-1">You</span>
            <span className="font-mono tabular-nums">{formatElapsed(board.me.elapsed_ms)}</span>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-neutral-500">
        {board.total_entries} {board.total_entries === 1 ? 'player has' : 'players have'} beaten it
        today
        {!signedIn && ' · sign in to see your own rank'}
      </p>
    </>
  );
}
