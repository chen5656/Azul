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
import { useIdentity } from '../auth/clerk';
import { Board } from '../components/Board';
import { Leaderboard } from '../components/Leaderboard';
import { StatusLine } from '../components/StatusLine';
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
  const opponentLabel = LEVEL_LABELS[level];

  const newGame = useCallback(() => newDailyGame(puzzleId), [puzzleId]);
  const ai = useMemo(
    () => ({
      level,
      seed: agentSeedForPuzzle(puzzleId),
      timeBudget: DAILY_TIME_BUDGET,
    }),
    [puzzleId, level],
  );
  const session = useGameSession({ newGame, ai, humanSeat: HUMAN_SEAT, timed: true });

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

  const restart = () => {
    submission.reset();
    offered.current = false;
    session.restart();
  };

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Daily Challenge <span className="text-neutral-500">vs {opponentLabel}</span>
            </h1>
            <p className="text-xs text-neutral-500">{puzzleId} · everyone gets this deal</p>
          </div>
          <div className="flex items-center gap-3">
            <Timer
              ms={session.elapsedMs}
              running={session.status !== 'idle' && session.status !== 'game-over'}
              done={session.status === 'game-over'}
            />
            <button
              type="button"
              onClick={restart}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              Restart
            </button>
          </div>
        </header>

        {/* Difficulty Picker */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">AI Opponent:</span>
          <div className="flex flex-wrap gap-1.5">
            {DAILY_LEVELS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => onSelectLevel(candidate)}
                aria-pressed={level === candidate}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  level === candidate
                    ? 'bg-sky-600 font-semibold text-white shadow-sm ring-1 ring-sky-400'
                    : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {LEVEL_LABELS[candidate]}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Your clock includes the opponent's thinking time. It thinks for a fixed 450ms a move, so
          its choices can vary slightly with how fast your device is.
        </p>

        <StatusLine session={session} opponentLabel={opponentLabel} />

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

        <Board session={session} humanLabel="You" opponentLabel={opponentLabel} />
      </div>

      <aside>
        <Leaderboard puzzleId={puzzleId} aiLevel={level} refreshKey={boardRefresh} />
      </aside>
    </div>
  );
}
