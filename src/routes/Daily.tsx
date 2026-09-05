/**
 * The Daily Challenge (FR-016 … FR-025).
 *
 * One deal per New York day. Supports multiple AI difficulty levels (Random, Greedy, Minimax, Monte Carlo; defaults to Easy).
 * The selected AI difficulty is synchronized via URL query parameter (e.g. `?ai=greedy` or `?ai=random`).
 * Timed on total wall clock including the opponent's thinking.
 * Ranked by score margin (human score - opponent score). Unlimited retries; any completed game is ranked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LEVEL_LABELS, type AgentLevel } from '../ai';
import { getLeaderboard } from '../api/client';
import { useIdentity } from '../auth';
import { Board } from '../components/Board';
import { GameResultCard } from '../components/GameResultCard';
import { Modal } from '../components/Modal';
import { RobotAvatar } from '../components/RobotAvatar';
import { encodeReplay } from '../replay/codec';
import { replayOf, replayUrl } from '../replay/share';
import { Timer } from '../components/Timer';
import { useGameStyle } from '../context/GameStyleContext';
import { HUMAN_SEAT, newDailyGame, puzzleIdFor } from '../daily/puzzle';
import {
  DAILY_LEVELS,
  RANKED_LEVELS as DAILY_RANKED_LEVELS,
  dailyHrefFor,
  isRankedLevel,
  resolveDailyLevel,
} from '../daily/levels';
import { setAttemptRunning } from '../game/attemptGuard';
import { useGameSession } from '../game/useGameSession';
import { useSubmission } from '../game/useSubmission';
import type { SubmissionState } from '../game/useSubmission';
import { useRouter } from '../router';
import { storage } from '../storage';

const RANKED_LEVELS = DAILY_RANKED_LEVELS;

/** The board the Daily leads with, and what an unranked game is nudged toward. */
const RANKED_LEVEL: AgentLevel = 'expert';

const isRanked = isRankedLevel;

/** "Extreme, Master and Expert" — the ranked levels, for prose. */
function rankedLevelList(): string {
  const labels = RANKED_LEVELS.map((l) => LEVEL_LABELS[l]);
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function Daily() {
  const { search, navigate } = useRouter();
  // The id the attempt is played under. It is captured when the attempt starts
  // and never swapped mid-game (FR-025).
  const [puzzleId, setPuzzleId] = useState(() => puzzleIdFor());
  const [today, setToday] = useState(puzzleId);
  const [attempt, setAttempt] = useState(0);

  const level = useMemo(() => resolveDailyLevel(search), [search]);

  // Remember whatever is in view, however it got there — the ⚙ menu navigates
  // straight to a level URL without going through `handleSelectLevel`.
  useEffect(() => {
    storage.setDailyLevel(level);
  }, [level]);

  // Re-resolve the New York date on focus and once a minute (§8.1).
  useEffect(() => {
    const check = () => setToday(puzzleIdFor());
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);

  const stale = today !== puzzleId;

  const handleSelectLevel = useCallback(
    (nextLevel: AgentLevel) => {
      if (nextLevel !== level) navigate(dailyHrefFor(nextLevel));
    },
    [level, navigate],
  );

  return (
    <div className="flex flex-col gap-4">
      {stale && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm">
          <span>A new Daily is available ({today}).</span>
          <button
            type="button"
            onClick={() => {
              setPuzzleId(today);
              setAttempt((n) => n + 1);
            }}
            className="rounded bg-amber-600 px-3 py-1 font-medium text-neutral-950 hover:bg-amber-500"
          >
            Play today's puzzle
          </button>
        </div>
      )}
      <DailyAttempt
        key={`${puzzleId}:${level}:${attempt}`}
        puzzleId={puzzleId}
        level={level}
        onSelectLevel={handleSelectLevel}
        onPlayAgain={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}

function DailyAttempt({
  puzzleId,
  level,
  onSelectLevel,
  onPlayAgain,
}: {
  puzzleId: string;
  level: AgentLevel;
  onSelectLevel: (level: AgentLevel) => void;
  onPlayAgain: () => void;
}) {
  const identity = useIdentity();
  const submission = useSubmission(identity);
  const [boardRefresh, setBoardRefresh] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [totalEntries, setTotalEntries] = useState<number | null>(null);
  const { style } = useGameStyle();
  const opponentLabel = LEVEL_LABELS[level];

  // Fetch leaderboard player count for current puzzle & level
  useEffect(() => {
    let active = true;
    async function loadCount() {
      try {
        const data = await getLeaderboard(puzzleId, level);
        if (active) {
          setTotalEntries(data.total_entries);
        }
      } catch {
        if (active && totalEntries === null) {
          setTotalEntries(0);
        }
      }
    }
    void loadCount();
    return () => {
      active = false;
    };
  }, [puzzleId, level, boardRefresh]);

  const newGame = useCallback(() => newDailyGame(puzzleId), [puzzleId]);
  // No seed: the session draws one per attempt, so reopening the day's deal
  // and repeating your moves does not replay the same game (FR-025 is about
  // the deal being fixed, not the opponent being a recording).
  const ai = useMemo(() => ({ level }), [level]);
  const session = useGameSession({ newGame, ai, humanSeat: HUMAN_SEAT, timed: true, maxUndos: 0 });

  const done = session.status === 'game-over' && session.error === null;
  const offered = useRef(false);

  // Holds back the service-worker update banner for the length of an attempt
  // (AC-038).
  const running = session.status !== 'idle' && session.status !== 'game-over';
  useEffect(() => {
    setAttemptRunning(running);
    return () => setAttemptRunning(false);
  }, [running]);

  // Offer the attempt exactly once for any completed game (win, loss, or draw).
  useEffect(() => {
    if (!done || offered.current) return;
    offered.current = true;
    storage.setLastDailyPlayed(puzzleId);
    const totalAttempts = storage.incrementDailyAttempts(puzzleId, level);
    // Playable, shareable, replayable — just not ranked. The Worker rejects it
    // too (UNRANKED_LEVEL); not posting keeps the player from seeing an error
    // for something they did nothing wrong to cause.
    if (!isRanked(level)) return;
    const result = session.game.result();
    // The replay travels with the score, so the Worker can re-run the game
    // rather than take the numbers on trust. Encoding is best-effort: a game
    // that cannot be encoded still posts, just unverified.
    let replay: string | undefined;
    try {
      replay = encodeReplay(
        replayOf(session.game, { aiLevel: level, humanSeat: HUMAN_SEAT, puzzleId }),
      );
    } catch {
      replay = undefined;
    }
    void submission.submit({
      puzzle_id: puzzleId,
      elapsed_ms: Math.round(session.elapsedMs),
      final_score: result.scores[HUMAN_SEAT],
      opponent_score: result.scores[1 - HUMAN_SEAT],
      rounds: result.rounds,
      ai_level: level,
      attempts: totalAttempts,
      replay,
    });
    // `submission` is rebuilt every render; the completion edge is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, puzzleId, level]);

  // Once a time is posted, the board the player is looking at is out of date.
  useEffect(() => {
    if (submission.state.kind === 'posted') setBoardRefresh((n) => n + 1);
  }, [submission.state.kind]);

  const handleUndo = () => {
    submission.reset();
    offered.current = false;
    session.undo();
  };

  const restart = () => {
    submission.reset();
    offered.current = false;
    session.restart();
  };

  const topRight = (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      <Timer
        ms={session.elapsedMs}
        startedAt={session.startedAt}
        running={session.status !== 'idle' && session.status !== 'game-over'}
        done={session.status === 'game-over'}
      />
      <button
        type="button"
        onClick={restart}
        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs sm:text-sm hover:bg-neutral-800 transition"
      >
        Restart
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 sm:gap-4 w-full">
      {session.status !== 'game-over' && <RecoveredSubmissionNotice state={submission.state} />}
      {session.status !== 'game-over' && !isRanked(level) && (
        <UnrankedBanner level={level} onSwitchToRanked={() => onSelectLevel(RANKED_LEVEL)} />
      )}
      {session.status === 'game-over' && style !== 'focus' && (
        <GameResultCard
          humanWon={session.humanWon}
          draw={session.game.result().draw}
          elapsedMs={session.elapsedMs}
          aiLevel={level}
          humanScore={session.game.result().scores[HUMAN_SEAT]}
          opponentScore={session.game.result().scores[1 - HUMAN_SEAT]}
          submissionState={submission.state}
          ranked={isRanked(level)}
          onPlayAgain={onPlayAgain}
          onWatchReplay={() => {
            try {
              const replay = replayOf(session.game, { aiLevel: level, humanSeat: HUMAN_SEAT, puzzleId });
              const url = replayUrl(replay);
              window.open(url, '_blank');
            } catch {
              // Replay encoding failed
            }
          }}
          onSwitchToRanked={() => onSelectLevel(RANKED_LEVEL)}
          onRetrySubmit={() => void submission.retry()}
          onDiscardSubmit={submission.discard}
          onOpenSignIn={identity.openSignIn}
        />
      )}

      <Board
        session={session}
        humanLabel="You"
        opponentLabel={opponentLabel}
        onUndo={handleUndo}
        topRight={topRight}
        onChangeLevel={() => setShowSettings(true)}
        title={`Daily Challenge (${puzzleId})`}
      />

      {/* Difficulty Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Difficulty Settings"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-neutral-400">
            Select the opponent difficulty for the Daily Challenge. Only {rankedLevelList()} games are posted to the leaderboard.
          </p>
          <div className="grid grid-cols-1 gap-2 pt-1">
            {DAILY_LEVELS.map((candidate) => {
              const isSelected = level === candidate;
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => {
                    onSelectLevel(candidate);
                    setShowSettings(false);
                  }}
                  className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-sky-500 bg-sky-950/50 ring-1 ring-sky-500/50'
                      : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {style !== 'focus' && <RobotAvatar level={candidate} className="h-10 w-10" />}
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-sky-300' : 'text-neutral-200'}`}>
                        {LEVEL_LABELS[candidate]}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          isRanked(candidate) ? 'text-amber-300' : 'text-neutral-500'
                        }`}
                      >
                        {isRanked(candidate) ? 'Ranked · goes on the board' : 'Not ranked'}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-neutral-950">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-current" fill="none" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );

            })}
          </div>
        </div>
      </Modal>

    </div>
  );
}

/**
 * A score recovered after a sign-in redirect belongs to a game this page no
 * longer has on screen, so `SubmitPanel` never renders for it. Without a line
 * of its own the post would happen silently and look exactly like the bug it
 * fixes.
 */
function RecoveredSubmissionNotice({ state }: { state: SubmissionState }) {
  let text: string | null = null;
  if (state.kind === 'submitting') text = 'Posting the score you played before signing in…';
  else if (state.kind === 'posted')
    text = `Your earlier score is on the board — rank ${state.rank} of ${state.totalEntries} today.`;
  else if (state.kind === 'not-improved')
    text = 'Your earlier score was not higher than your previous best, so the board is unchanged.';
  else if (state.kind === 'failed') text = state.message;
  if (!text) return null;

  return (
    <p className="rounded-xl border border-sky-800 bg-sky-950/30 p-3 text-sm text-neutral-300">
      {text}
    </p>
  );
}


/**
 * Says the quiet part out loud, for the whole game rather than only at the end:
 * the default opponent is Easy and the board only ranks Extreme, so without
 * this a player finishes a good game and finds out too late that it counted
 * for nothing.
 */
function UnrankedBanner({
  level,
  onSwitchToRanked,
}: {
  level: AgentLevel;
  onSwitchToRanked: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleShareClick = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/90 px-3.5 py-1.5 text-xs text-neutral-300 shadow-sm backdrop-blur-sm sm:text-sm">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs">
          🏆
        </span>
        <span className="font-semibold text-neutral-200">
          {LEVEL_LABELS[level]} games aren&apos;t ranked
        </span>
        <span className="text-neutral-500">•</span>
        <span className="text-neutral-400">
          Expert, Master &amp; Extreme count toward today&apos;s leaderboard.
        </span>
        <button
          type="button"
          onClick={onSwitchToRanked}
          className="ml-1 inline-flex items-center gap-1 font-semibold text-amber-400 transition hover:text-amber-300 hover:underline"
        >
          Play {LEVEL_LABELS[RANKED_LEVEL]} &rarr;
        </button>
      </div>

      <button
        type="button"
        onClick={handleShareClick}
        title="Share game link"
        className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-xs sm:text-sm font-medium text-neutral-200 shadow-sm transition hover:bg-neutral-800 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 stroke-current"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span>{copied ? 'Link copied!' : 'Share game'}</span>
      </button>
    </div>
  );
}
