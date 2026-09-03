/**
 * The standalone board at `/leaderboard`, `/leaderboard/today` and
 * `/leaderboard/YYYY-MM-DD` (§9.1). Readable signed out (FR-036).
 *
 * The board's ordering key is the margin over the agent, and a margin against
 * Easy is not comparable to one against Extreme — so the levels can never be
 * mixed into one table. They are not, however, six equal boards: the three
 * strongest agents are ranked and get a tab each, and the three weakest are
 * unranked — nothing new is written there, so their old rows stay behind a
 * disclosure rather than splitting a day's field six ways.
 */

import { useCallback, useMemo } from 'react';

import { LEVEL_LABELS, type AgentLevel } from '../ai';
import { Leaderboard } from '../components/Leaderboard';
import { RobotAvatar } from '../components/RobotAvatar';
import { useGameStyle } from '../context/GameStyleContext';
import { FIRST_PUZZLE_ID, isPlayablePuzzleId, puzzleIdFor, shiftPuzzleId } from '../daily/puzzle';
import { Link, useRouter } from '../router';

/** The boards the Daily is ranked on, strongest first; the first is the default. */
const RANKED_LEVELS: readonly AgentLevel[] = ['extreme', 'master', 'expert'];

const RANKED_LEVEL: AgentLevel = RANKED_LEVELS[0];

/** Closed boards, kept readable for the rows posted before they were retired. */
const PRACTICE_LEVELS: readonly AgentLevel[] = ['hard', 'medium', 'easy'];

const ALL_LEVELS: readonly AgentLevel[] = [...RANKED_LEVELS, ...PRACTICE_LEVELS];

const isRanked = (level: AgentLevel) => RANKED_LEVELS.includes(level);

function levelFromSearch(search: string): AgentLevel {
  const ai = new URLSearchParams(search).get('ai');
  return ai && (ALL_LEVELS as readonly string[]).includes(ai) ? (ai as AgentLevel) : RANKED_LEVEL;
}

export function LeaderboardPage() {
  const { search, params, navigate } = useRouter();
  const level = useMemo(() => levelFromSearch(search), [search]);
  const { style } = useGameStyle();

  const today = puzzleIdFor();
  // An out-of-range date in the URL falls back to today rather than showing a
  // board that could never have entries.
  const date =
    params.date && isPlayablePuzzleId(params.date, today) ? params.date : today;
  const isToday = date === today;

  /** The ranked tab in view; an unranked `?ai=` leaves the default tab showing. */
  const rankedLevel = isRanked(level) ? level : RANKED_LEVEL;

  const go = useCallback(
    (nextDate: string, nextLevel: AgentLevel) => {
      const path = nextDate === today ? '/leaderboard' : `/leaderboard/${nextDate}`;
      navigate(nextLevel === RANKED_LEVEL ? path : `${path}?ai=${nextLevel}`);
    },
    [navigate, today],
  );

  const atStart = date <= FIRST_PUZZLE_ID;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-2xl font-semibold">Leaderboard</h1>

      {/* ---- the day ---- */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
        <button
          type="button"
          disabled={atStart}
          onClick={() => go(shiftPuzzleId(date, -1, today), level)}
          aria-label="Previous day"
          className="cursor-pointer rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-sm text-neutral-200 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹
        </button>
        <span className="min-w-[7.5rem] text-center font-medium tabular-nums">{date}</span>
        <button
          type="button"
          disabled={isToday}
          onClick={() => go(shiftPuzzleId(date, 1, today), level)}
          aria-label="Next day"
          className="cursor-pointer rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-sm text-neutral-200 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ›
        </button>

        <input
          type="date"
          value={date}
          min={FIRST_PUZZLE_ID}
          max={today}
          onChange={(event) => {
            if (isPlayablePuzzleId(event.target.value, today)) go(event.target.value, level);
          }}
          aria-label="Pick a day"
          className="cursor-pointer rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
        />

        {!isToday && (
          <button
            type="button"
            onClick={() => go(today, level)}
            className="cursor-pointer rounded-md px-2 py-1 text-xs text-sky-400 underline hover:text-sky-300"
          >
            Back to today
          </button>
        )}
      </div>

      {/* ---- the ranked boards ---- */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {RANKED_LEVELS.map((candidate) => {
          const active = rankedLevel === candidate;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => go(date, candidate)}
              aria-pressed={active}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition ${active
                  ? 'bg-sky-600 font-semibold text-white shadow-sm ring-1 ring-sky-400'
                  : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                }`}
            >
              {style !== 'focus' && <RobotAvatar level={candidate} className="h-5 w-5" />}
              <span>{LEVEL_LABELS[candidate]}</span>
            </button>
          );
        })}
        <span className="ml-1 text-xs font-normal uppercase tracking-wider text-sky-400">
          Ranked
        </span>
      </div>

      <Leaderboard
        key={`${date}:${rankedLevel}`}
        puzzleId={date}
        aiLevel={rankedLevel}
        variant="full"
        emptyLabel={
          isToday
            ? `Nobody has posted a time against ${LEVEL_LABELS[rankedLevel]} today — be the first.`
            : `Nobody posted a time against ${LEVEL_LABELS[rankedLevel]} on this day.`
        }
      />

      <p className="mt-4 text-sm text-neutral-500">
        Score is your margin over the agent.{' '}
        {isToday ? (
          <>
            <Link to="/daily" className="underline hover:text-neutral-300">
              Play today’s puzzle
            </Link>
            .
          </>
        ) : (
          // A past puzzle can no longer be posted to — the Worker rejects it as
          // STALE_PUZZLE — so this must not read as an invitation to play it.
          <>This day is closed; times can only be posted on the current puzzle.</>
        )}
      </p>
    </div>
  );
}
