/**
 * `/history` — every Daily the signed-in player has posted.
 *
 * `scores` already keeps one row per (day, opponent), so this is a read of
 * rows that always existed rather than a new kind of record. Rows posted by a
 * client that sends its replay get a Watch link; older rows simply do not.
 */

import { useCallback, useEffect, useState } from 'react';

import { LEVEL_LABELS, type AgentLevel } from '../ai';
import { ApiError, type HistoryEntry, getHistory } from '../api/client';
import { RobotAvatar } from '../components/RobotAvatar';
import { useIdentity } from '../auth';
import { useGameStyle } from '../context/GameStyleContext';
import { REPLAY_PATH, formatDuration } from '../replay/share';
import { Link } from '../router';

type Load = 'loading' | 'ready' | 'signed-out' | 'error';

export function HistoryPage() {
  const identity = useIdentity();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<Load>('loading');
  const [message, setMessage] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (before: string | null, append: boolean) => {
      if (!identity.signedIn) {
        setState(identity.ready ? 'signed-out' : 'loading');
        return;
      }
      try {
        const page = await getHistory({ before });
        setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
        setCursor(page.next_before);
        setState('ready');
      } catch (err) {
        setMessage(err instanceof ApiError ? err.message : 'Could not load your history.');
        setState('error');
      }
    },
    [identity.signedIn, identity.ready],
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  if (state === 'signed-out') {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <h1 className="mb-2 text-xl font-semibold">Your history</h1>
        <p className="mb-4 text-sm text-neutral-400">
          Sign in to see the Dailies you have posted — and to rewatch them.
        </p>
        <button
          type="button"
          onClick={identity.openSignIn}
          className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Your history</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Your best attempt on each day, against each opponent.
      </p>

      {state === 'loading' && <p className="text-sm text-neutral-400">Loading…</p>}

      {state === 'error' && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-3">
          <p role="alert" className="text-sm text-rose-200">
            {message}
          </p>
          <button
            type="button"
            onClick={() => void fetchPage(null, false)}
            className="mt-2 cursor-pointer rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && entries.length === 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-6 text-center">
          <p className="mb-3 text-sm text-neutral-300">You have not posted a Daily yet.</p>
          <Link
            to="/daily"
            className="inline-block rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Play today’s puzzle
          </Link>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <HistoryRow key={`${entry.puzzle_id}:${entry.ai_level}`} entry={entry} />
          ))}
        </ul>
      )}

      {cursor && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await fetchPage(cursor, true);
            setLoadingMore(false);
          }}
          className="mt-3 w-full cursor-pointer rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { style } = useGameStyle();
  const level = entry.ai_level as AgentLevel;
  const label = LEVEL_LABELS[level] ?? entry.ai_level;
  const won = entry.margin > 0;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      {style !== 'focus' && <RobotAvatar level={level} className="h-8 w-8 shrink-0" />}

      <div className="min-w-[7rem] flex-1">
        <Link
          to={`/leaderboard/${entry.puzzle_id}?ai=${entry.ai_level}`}
          className="font-medium tabular-nums hover:underline"
        >
          {entry.puzzle_id}
        </Link>
        <p className="text-xs text-neutral-400">vs {label}</p>
      </div>

      <div className="text-right">
        <p className="tabular-nums">
          <span className={won ? 'font-semibold text-emerald-400' : 'text-neutral-300'}>
            {entry.final_score}–{entry.opponent_score}
          </span>{' '}
          <span className="text-xs text-neutral-500">
            ({entry.margin >= 0 ? '+' : ''}
            {entry.margin})
          </span>
        </p>
        <p className="text-xs tabular-nums text-neutral-500">
          {formatDuration(entry.elapsed_ms)}
          {entry.attempts && entry.attempts > 1 && ` · ${entry.attempts} attempts`}
          {entry.rank !== null && ` · #${entry.rank}`}
        </p>
      </div>

      {entry.replay ? (
        <Link
          to={`${REPLAY_PATH}#${entry.replay}`}
          className="cursor-pointer rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
        >
          Watch
        </Link>
      ) : (
        // Rows posted before replays existed have nothing to play back. Saying
        // so beats a dead button.
        <span
          className="text-xs text-neutral-600"
          title="This game was posted before replays were recorded."
        >
          No replay
        </span>
      )}
    </li>
  );
}
