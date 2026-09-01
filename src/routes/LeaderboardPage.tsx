/**
 * The standalone board at `/leaderboard` and `/leaderboard/today` (§9.1).
 * Readable signed out (FR-036).
 *
 * The agents are not comparable opponents, so each gets its own board rather
 * than one mixed table. Monte Carlo is the default, and the choice rides on
 * `?ai=` so a board can be linked to.
 */

import { useCallback, useMemo } from 'react';

import { LEVELS, LEVEL_LABELS, type AgentLevel } from '../ai';
import { Leaderboard } from '../components/Leaderboard';
import { RobotAvatar } from '../components/RobotAvatar';
import { useGameStyle } from '../context/GameStyleContext';
import { puzzleIdFor } from '../daily/puzzle';
import { Link, useRouter } from '../router';

const BOARD_LEVELS: readonly AgentLevel[] = [
  'extreme',
  'master',
  'expert',
  'hard',
  'medium',
  'easy',
] as const;

function levelFromSearch(search: string): AgentLevel {
  const ai = new URLSearchParams(search).get('ai');
  return ai && (LEVELS as readonly string[]).includes(ai) ? (ai as AgentLevel) : 'extreme';
}

export function LeaderboardPage() {
  const { search, navigate } = useRouter();
  const level = useMemo(() => levelFromSearch(search), [search]);
  const { style } = useGameStyle();

  const select = useCallback(
    (next: AgentLevel) => {
      if (next === level) return;
      const base = window.location.pathname.replace(/\/+$/, '') || '/leaderboard';
      navigate(next === 'extreme' ? base : `${base}?ai=${next}`);
    },
    [level, navigate],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-2xl font-semibold">Leaderboard</h1>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          AI Opponent:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {BOARD_LEVELS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => select(candidate)}
              aria-pressed={level === candidate}
              className={`inline-flex items-center gap-1.5 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${
                level === candidate
                  ? 'bg-sky-600 font-semibold text-white shadow-sm ring-1 ring-sky-400'
                  : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
              }`}
            >
              {style !== 'focus' && <RobotAvatar level={candidate} className="h-5 w-5" />}
              <span>{LEVEL_LABELS[candidate]}</span>
            </button>
          ))}
        </div>
      </div>


      <Leaderboard puzzleId={puzzleIdFor()} aiLevel={level} variant="full" />

      <p className="mt-4 text-sm text-neutral-500">
        Scores are for today's puzzle only, and each opponent has its own board. Score is your
        margin over the agent.{' '}
        <Link to="/daily" className="underline hover:text-neutral-300">
          Play it
        </Link>
        .
      </p>
    </div>
  );
}
