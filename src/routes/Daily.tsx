/**
 * The Daily Challenge (FR-016 … FR-025).
 *
 * One deal per New York day. Supports multiple AI difficulty levels (Random, Greedy, Minimax, Monte Carlo; defaults to Easy).
 * The selected AI difficulty is synchronized via URL query parameter (e.g. `?ai=greedy` or `?ai=random`).
 * Timed on total wall clock including the opponent's thinking.
 * Ranked by score margin (human score - opponent score). Unlimited retries; any completed game is ranked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LEVELS, LEVEL_LABELS, type AgentLevel } from '../ai';
import { getLeaderboard } from '../api/client';
import { useIdentity } from '../auth';
import { Board } from '../components/Board';
import { Modal } from '../components/Modal';
import { RobotAvatar } from '../components/RobotAvatar';
import { ShareReplay } from '../components/ShareReplay';
import { encodeReplay } from '../replay/codec';
import { replayOf } from '../replay/share';
import { SubmitPanel } from '../components/SubmitPanel';
import { Timer } from '../components/Timer';
import { useGameStyle } from '../context/GameStyleContext';
import { HUMAN_SEAT, newDailyGame, puzzleIdFor } from '../daily/puzzle';
import {
  DAILY_LEVELS,
  DEFAULT_LEVEL,
  LEVEL_DESCRIPTIONS,
  RANKED_LEVELS as DAILY_RANKED_LEVELS,
  dailyHrefFor,
  isRankedLevel,
} from '../daily/levels';
import { setAttemptRunning } from '../game/attemptGuard';
import { useGameSession } from '../game/useGameSession';
import { useSubmission } from '../game/useSubmission';
import type { SubmissionState } from '../game/useSubmission';
import { useRouter } from '../router';
import { storage } from '../storage';

const RANKED_LEVELS = DAILY_RANKED_LEVELS;

/** The board the Daily leads with, and what an unranked game is nudged toward. */
const RANKED_LEVEL: AgentLevel = 'extreme';

const isRanked = isRankedLevel;

/** "Extreme, Master and Expert" — the ranked levels, for prose. */
function rankedLevelList(): string {
  const labels = RANKED_LEVELS.map((l) => LEVEL_LABELS[l]);
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function getLevelFromSearch(search: string): AgentLevel {
  const params = new URLSearchParams(search);
  const ai = params.get('ai') ?? params.get('level');
  if (ai && (LEVELS as readonly string[]).includes(ai)) {
    return ai as AgentLevel;
  }
  // The opening opponent for someone who has never played. Note this is *not*
  // `RANKED_LEVEL`: a Daily played on the default difficulty is not posted to
  // the board, and the panel says so.
  return DEFAULT_LEVEL;
}

export function Daily() {
  const { search, navigate } = useRouter();
  // The id the attempt is played under. It is captured when the attempt starts
  // and never swapped mid-game (FR-025).
  const [puzzleId, setPuzzleId] = useState(() => puzzleIdFor());
  const [today, setToday] = useState(puzzleId);
  const [attempt, setAttempt] = useState(0);

  const level = useMemo(() => getLevelFromSearch(search), [search]);

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
      {session.status === 'game-over' && (
        <SubmitPanel
          admissible={isRanked(level)}
          unrankedReason={`Only games against ${rankedLevelList()} are ranked, so this time was not posted to today's board.`}
          unrankedAction={
            <button
              type="button"
              onClick={() => onSelectLevel(RANKED_LEVEL)}
              className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
            >
              Play {LEVEL_LABELS[RANKED_LEVEL]} for the board
            </button>
          }
          humanWon={session.humanWon}
          draw={session.game.result().draw}
          elapsedMs={session.elapsedMs}
          opponentLabel={opponentLabel}
          state={submission.state}
          onRetry={() => void submission.retry()}
          onDiscard={submission.discard}
          onPlayAgain={onPlayAgain}
        >
          <ShareReplay
            game={session.game}
            aiLevel={level}
            levelLabel={opponentLabel}
            humanSeat={HUMAN_SEAT}
            puzzleId={puzzleId}
            elapsedMs={session.elapsedMs}
            rank={submission.state.kind === 'posted' ? submission.state.rank : null}
            totalEntries={totalEntries}
          />
        </SubmitPanel>
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
                      <span className="text-xs text-neutral-400">
                        {LEVEL_DESCRIPTIONS[candidate]}
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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-600/70 bg-amber-950/40 p-3 text-sm">
      <span className="rounded-full border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
        Not ranked
      </span>
      <span className="text-amber-100/90">
        You are playing {LEVEL_LABELS[level]}. Only {rankedLevelList()} games go on today's
        leaderboard.
      </span>
      <button
        type="button"
        onClick={onSwitchToRanked}
        className="rounded-md bg-amber-500 px-3 py-1 font-semibold text-neutral-950 transition hover:bg-amber-400"
      >
        Switch to {LEVEL_LABELS[RANKED_LEVEL]}
      </button>
      <span className="text-xs text-amber-200/60">Switching starts a fresh game.</span>
    </div>
  );
}
