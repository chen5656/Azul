/** The standalone board at `/leaderboard` (§9.1). Readable signed out (FR-036). */

import { Leaderboard } from '../components/Leaderboard';
import { puzzleIdFor } from '../daily/puzzle';
import { Link } from '../router';

export function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-3 text-2xl font-semibold">Leaderboard</h1>
      <Leaderboard puzzleId={puzzleIdFor()} />
      <p className="mt-4 text-sm text-neutral-500">
        Times are for today's puzzle only.{' '}
        <Link to="/daily" className="underline hover:text-neutral-300">
          Play it
        </Link>
        .
      </p>
    </div>
  );
}
