/** Two entry cards, the day's date, and whether you've played it (§9.1). */

import { Link } from '../router';
import { puzzleIdFor } from '../daily/puzzle';
import { storage } from '../storage';

export function Home() {
  const puzzleId = puzzleIdFor();
  const playedToday = storage.lastDailyPlayed() === puzzleId;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold">Quadro</h1>
      <p className="mt-2 text-neutral-400">
        A tile-drafting duel. Draft a color, stage it, settle it onto your grid — and beat the
        machine faster than anyone else did today.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          to="/daily"
          className="rounded-xl border border-sky-800 bg-sky-950/40 p-4 transition hover:border-sky-500"
        >
          <h2 className="text-lg font-semibold">Daily Challenge</h2>
          <p className="mt-1 text-sm text-neutral-400">
            One deal for everyone. Choose your difficulty, maximize your score margin, and take the lead on today's board.
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            {puzzleId}
            {playedToday && <span className="ml-2 text-sky-300">you've played today</span>}
          </p>
        </Link>

        <Link
          to="/practice"
          className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-4 transition hover:border-neutral-500"
        >
          <h2 className="text-lg font-semibold">Practice</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Any opponent, any deal, untimed. Nothing is recorded.
          </p>
          <p className="mt-3 text-xs text-neutral-500">Works offline</p>
        </Link>
      </div>

      <p className="mt-8 text-sm text-neutral-500">
        <Link to="/leaderboard" className="underline hover:text-neutral-300">
          Today's leaderboard
        </Link>
      </p>
    </div>
  );
}
