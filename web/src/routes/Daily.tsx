/**
 * The Daily Challenge (FR-016 … FR-025).
 *
 * One deal per New York day, always against Monte Carlo, timed on total wall
 * clock including the opponent's thinking. Unlimited retries; only a win counts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DAILY_TIME_BUDGET, LEVEL_LABELS } from '../ai';
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
import { storage } from '../storage';

const OPPONENT_LABEL = LEVEL_LABELS.mcts;

export function Daily() {
  // The id the attempt is played under. It is captured when the attempt starts
  // and never swapped mid-game (FR-025).
  const [puzzleId, setPuzzleId] = useState(() => puzzleIdFor());
  const [today, setToday] = useState(puzzleId);
  const [attempt, setAttempt] = useState(0);

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
        key={`${puzzleId}:${attempt}`}
        puzzleId={puzzleId}
        onPlayAgain={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}

function DailyAttempt({
  puzzleId,
  onPlayAgain,
}: {
  puzzleId: string;
  onPlayAgain: () => void;
}) {
  const identity = useIdentity();
  const submission = useSubmission(identity);
  const [boardRefresh, setBoardRefresh] = useState(0);

  const newGame = useCallback(() => newDailyGame(puzzleId), [puzzleId]);
  const ai = useMemo(
    () => ({
      level: 'mcts' as const,
      seed: agentSeedForPuzzle(puzzleId),
      timeBudget: DAILY_TIME_BUDGET,
    }),
    [puzzleId],
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

  // Offer the attempt exactly once, and only for an outright win by the human
  // (FR-021, AC-015, AC-016).
  useEffect(() => {
    if (!done || offered.current) return;
    offered.current = true;
    storage.setLastDailyPlayed(puzzleId);
    if (!session.humanWon) return;
    const result = session.game.result();
    void submission.submit({
      puzzle_id: puzzleId,
      elapsed_ms: Math.round(session.elapsedMs),
      final_score: result.scores[HUMAN_SEAT],
      opponent_score: result.scores[1 - HUMAN_SEAT],
      rounds: result.rounds,
    });
    // `submission` is rebuilt every render; the completion edge is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, puzzleId]);

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
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Daily Challenge <span className="text-neutral-500">vs {OPPONENT_LABEL}</span>
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

        <p className="text-xs text-neutral-500">
          Your clock includes the opponent's thinking time. It thinks for a fixed 450ms a move, so
          its choices can vary slightly with how fast your device is.
        </p>

        <StatusLine session={session} opponentLabel={OPPONENT_LABEL} />

        {session.status === 'game-over' && (
          <SubmitPanel
            admissible={session.humanWon}
            elapsedMs={session.elapsedMs}
            state={submission.state}
            onRetry={() => void submission.retry()}
            onDiscard={submission.discard}
            onPlayAgain={onPlayAgain}
          />
        )}

        <Board session={session} humanLabel="You" opponentLabel={OPPONENT_LABEL} />
      </div>

      <aside>
        <Leaderboard puzzleId={puzzleId} refreshKey={boardRefresh} />
      </aside>
    </div>
  );
}
