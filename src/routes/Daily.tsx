/**
 * The Daily Challenge (FR-016 … FR-025).
 *
 * One deal per New York day. Supports multiple AI difficulty levels (Random, Greedy, Minimax, Monte Carlo; defaults to Monte Carlo).
 * The selected AI difficulty is synchronized via URL query parameter (e.g. `?ai=greedy` or `?ai=random`).
 * Timed on total wall clock including the opponent's thinking.
 * Ranked by score margin (human score - opponent score). Unlimited retries; any completed game is ranked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DAILY_TIME_BUDGET, LEVELS, LEVEL_LABELS, type AgentLevel } from '../ai';
import { getLeaderboard } from '../api/client';
import { useIdentity } from '../auth/clerk';
import { Board } from '../components/Board';
import { Leaderboard } from '../components/Leaderboard';
import { Modal } from '../components/Modal';
import { RobotAvatar } from '../components/RobotAvatar';
import { SubmitPanel } from '../components/SubmitPanel';
import { Timer } from '../components/Timer';
import {
  HUMAN_SEAT,
  agentSeedForPuzzle,
  newDailyGame,
  puzzleIdFor,
} from '../daily/puzzle';
import { setAttemptRunning } from '../game/attemptGuard';
import { useGameSession } from '../game/useGameSession';
import { useSubmission } from '../game/useSubmission';
import { useRouter } from '../router';
import { storage } from '../storage';

// Strongest first: the Daily's default opponent leads the row.
const DAILY_LEVELS: readonly AgentLevel[] = [
  'extreme',
  'master',
  'expert',
  'hard',
  'medium',
  'easy',
] as const;

const LEVEL_DESCRIPTIONS: Record<AgentLevel, string> = {
  extreme: 'Deep Monte Carlo Tree Search (MCTS)',
  master: 'Minimax search with advanced heuristic evaluation',
  expert: 'Lookahead minimax tree evaluation',
  hard: 'Aggressive heuristic scoring & line planning',
  medium: 'Standard heuristic pattern matching',
  easy: 'Greedy local tile selections',
};

function getLevelFromSearch(search: string): AgentLevel {
  const params = new URLSearchParams(search);
  const ai = params.get('ai') ?? params.get('level');
  if (ai && (LEVELS as readonly string[]).includes(ai)) {
    return ai as AgentLevel;
  }
  return 'extreme';
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
      if (nextLevel !== level) {
        const params = new URLSearchParams(window.location.search);
        if (nextLevel === 'extreme') {
          params.delete('ai');
          params.delete('level');
        } else {
          params.set('ai', nextLevel);
        }
        const qs = params.toString();
        navigate(qs ? `/daily?${qs}` : '/daily');
      }
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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [totalEntries, setTotalEntries] = useState<number | null>(null);
  const opponentLabel = LEVEL_LABELS[level];

  // Fetch leaderboard player count for current puzzle & level
  useEffect(() => {
    let active = true;
    async function loadCount() {
      try {
        const token = (await identity.getToken()) ?? undefined;
        const data = await getLeaderboard(puzzleId, level, token);
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
  }, [puzzleId, level, boardRefresh, identity]);

  const newGame = useCallback(() => newDailyGame(puzzleId), [puzzleId]);
  const ai = useMemo(
    () => ({
      level,
      seed: agentSeedForPuzzle(puzzleId),
      timeBudget: DAILY_TIME_BUDGET,
    }),
    [puzzleId, level],
  );
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
    const result = session.game.result();
    void submission.submit({
      puzzle_id: puzzleId,
      elapsed_ms: Math.round(session.elapsedMs),
      final_score: result.scores[HUMAN_SEAT],
      opponent_score: result.scores[1 - HUMAN_SEAT],
      rounds: result.rounds,
      ai_level: level,
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

  const countDisplay = totalEntries === null ? '0' : totalEntries > 100 ? '100+' : String(totalEntries);

  const topRight = (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      <Timer
        ms={session.elapsedMs}
        running={session.status !== 'idle' && session.status !== 'game-over'}
        done={session.status === 'game-over'}
      />
      <button
        type="button"
        onClick={() => setShowLeaderboard(true)}
        aria-label={`View Leaderboard (${countDisplay} players)`}
        title={`View Today's Leaderboard (${countDisplay} players)`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-xs sm:text-sm font-medium hover:bg-neutral-700 text-neutral-200 transition"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 stroke-current text-amber-400"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34" />
          <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
        </svg>
        <span>Top scores</span>
        <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold text-amber-300 leading-none">
          {countDisplay}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        aria-label="Difficulty Settings"
        title="Change Difficulty"
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-xs sm:text-sm font-medium hover:bg-neutral-700 text-neutral-200 transition"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 stroke-current text-neutral-400"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Level - {opponentLabel}</span>
      </button>
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
      {session.status === 'game-over' && (
        <SubmitPanel
          admissible={true}
          humanWon={session.humanWon}
          draw={session.game.result().draw}
          elapsedMs={session.elapsedMs}
          opponentLabel={opponentLabel}
          state={submission.state}
          onRetry={() => void submission.retry()}
          onDiscard={submission.discard}
          onPlayAgain={onPlayAgain}
        />
      )}

      <Board
        session={session}
        humanLabel="You"
        opponentLabel={opponentLabel}
        onUndo={handleUndo}
        topRight={topRight}
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
            Select the opponent difficulty for the Daily Challenge. Each difficulty has its own independent leaderboard.
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
                    <RobotAvatar level={candidate} className="h-10 w-10" />
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-sky-300' : 'text-neutral-200'}`}>
                        {LEVEL_LABELS[candidate]}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {LEVEL_DESCRIPTIONS[candidate]}
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

      {/* Leaderboard Modal */}
      <Modal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        title={`Today's Top Scores (${puzzleId})`}
        maxWidth="max-w-2xl"
      >
        <Leaderboard
          puzzleId={puzzleId}
          aiLevel={level}
          refreshKey={boardRefresh}
          variant="full"
          onLoaded={(b) => setTotalEntries(b.total_entries)}
        />
      </Modal>
    </div>
  );
}

