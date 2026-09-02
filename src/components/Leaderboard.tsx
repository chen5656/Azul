/**
 * Today's global board (FR-033 … FR-038).
 *
 * Readable without signing in. Offline is a state, not an error, and never
 * blocks play (FR-037).
 *
 * Two shapes: `compact` beside the game, where the only number that matters is
 * the margin, and `full` on `/leaderboard/today`, which also breaks the margin
 * out into the player's own score and the agent's.
 */

import { useCallback, useEffect, useState } from 'react';

import { LEVEL_LABELS, type AgentLevel } from '../ai';
import { ApiError, type Leaderboard as Board, getLeaderboard } from '../api/client';
import { useIdentity } from '../auth';
import { useGameStyle } from '../context/GameStyleContext';
import { HumanAvatar } from './RobotAvatar';
import { formatElapsedSeconds } from './Timer';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; board: Board }
  | { kind: 'offline' }
  | { kind: 'failed'; message: string };

export function Leaderboard({
  puzzleId,
  aiLevel,
  variant = 'compact',
  /** Bump to refetch — the Daily does this after a successful submission. */
  refreshKey = 0,
  onLoaded,
  emptyLabel,
}: {
  puzzleId: string;
  aiLevel: AgentLevel;
  variant?: 'compact' | 'full';
  /**
   * What an empty board says. The default is about *today*, which is wrong on
   * a past day's board, so the dated pages pass their own.
   */
  emptyLabel?: string;
  refreshKey?: number;
  onLoaded?: (board: Board) => void;
}) {
  const identity = useIdentity();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const board = await getLeaderboard(puzzleId, aiLevel);
      setState({ kind: 'ready', board });
      onLoaded?.(board);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setState(
        apiError?.code === 'OFFLINE'
          ? { kind: 'offline' }
          : { kind: 'failed', message: apiError?.message ?? 'Could not load the board' },
      );
    }
    // `onLoaded` is a fresh closure each render; the puzzle, the agent and the
    // refresh counter are what should actually trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId, aiLevel, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      aria-label={`Leaderboard vs ${LEVEL_LABELS[aiLevel]}`}
      className="rounded-xl border border-neutral-800 p-3"
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">
          Today's top scores <span className="text-neutral-500">vs {LEVEL_LABELS[aiLevel]}</span>
        </h2>
        <span className="text-xs text-neutral-500">{puzzleId}</span>
      </header>
      <Body
        state={state}
        onRetry={load}
        signedIn={identity.signedIn}
        variant={variant}
        emptyLabel={emptyLabel}
      />
    </section>
  );
}

/** The margin is the score. Sign it so a loss reads as one at a glance. */
function Score({ diff }: { diff: number }) {
  const tone = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-neutral-300';
  return (
    <span className={`font-medium tabular-nums ${tone}`}>
      {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

function Body({
  state,
  onRetry,
  signedIn,
  variant,
  emptyLabel,
}: {
  state: State;
  onRetry: () => void;
  signedIn: boolean;
  variant: 'compact' | 'full';
  emptyLabel?: string;
}) {
  const identity = useIdentity();

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
    return (
      <p className="text-sm text-neutral-400">
        {emptyLabel ?? 'Nobody has played it yet today.'}
      </p>
    );
  }

  const full = variant === 'full';
  const meInList =
    board.me !== null && board.entries.some((entry) => entry.rank === board.me!.rank);

  const rows = [
    ...board.entries.map((entry) => ({ ...entry, isMe: board.me?.rank === entry.rank })),
    ...(board.me !== null && !meInList
      ? [{ ...board.me, display_name: identity.displayName || 'You', isMe: true }]
      : []),
  ];

  const { style } = useGameStyle();

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium text-neutral-500">
              <th scope="col" className="w-8 px-1 pb-1 text-left">
                #
              </th>
              <th scope="col" className="px-1 pb-1 text-left">
                Player
              </th>
              <th scope="col" className="w-16 px-1 pb-1 text-right">
                Score
              </th>
              {full && (
                <>
                  <th scope="col" className="w-24 px-1 pb-1 text-right">
                    User score
                  </th>
                  <th scope="col" className="w-24 px-1 pb-1 text-right">
                    Agent score
                  </th>
                </>
              )}
              <th scope="col" className="w-16 px-1 pb-1 text-right">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => {
              const isMe = row.isMe;
              const displayName = isMe
                ? identity.displayName || row.display_name || 'You'
                : row.display_name;

              return (
                <tr key={row.rank} className={isMe ? 'text-sky-300 bg-sky-950/20' : ''}>
                  <td className="px-1 py-1.5 tabular-nums text-neutral-500">{row.rank}</td>
                  <td className="max-w-0 truncate px-1 py-1.5">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {style !== 'focus' && (
                        <HumanAvatar
                          color={isMe ? 'sky' : 'neutral'}
                          className="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
                        />
                      )}
                      <span className="truncate font-medium">{displayName}</span>
                      {isMe && displayName !== 'You' && (
                        <span className="shrink-0 rounded bg-sky-950/80 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-sky-400/40">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <Score diff={row.final_score - row.opponent_score} />
                  </td>
                  {full && (
                    <>
                      <td className="px-1 py-1.5 text-right tabular-nums text-neutral-300">
                        {row.final_score}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-neutral-400">
                        {row.opponent_score}
                      </td>
                    </>
                  )}
                  <td className="px-1 py-1.5 text-right font-mono text-xs tabular-nums text-neutral-400">
                    {formatElapsedSeconds(row.elapsed_ms)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {board.total_entries} {board.total_entries === 1 ? 'player has' : 'players have'} played
        today
        {!signedIn && ' · sign in to see your own rank'}
      </p>
    </>
  );
}
