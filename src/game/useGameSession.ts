/**
 * Drives one game against one agent, for both Practice and the Daily.
 *
 * The engine is mutable and lives in a ref; React re-renders on a version
 * counter rather than on structural sharing, which keeps the board's 100-odd
 * cells off the reconciliation path during AI search.
 *
 * There is no undo, in any mode (D-014, FR-013, FR-022). Restart is the only way
 * back, and it discards the clock (FR-020).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Action,
  CENTER,
  type GameEvent,
  PENALTY_DEST,
  type Preview,
  QuadroGame,
  isLegal,
  legalActions,
  preview,
} from '../engine';
import { AiClient, AiDisposed, type AiMode, type AiSpec } from './aiClient';

export type SessionStatus =
  | 'idle' // dealt, waiting for the player's first move; the clock has not started
  | 'your-turn'
  | 'ai-thinking'
  | 'game-over';

export interface Selection {
  source: number;
  color: number;
}

export interface SessionOptions {
  /** Builds a fresh game. Called on mount and on every restart. */
  newGame: () => QuadroGame;
  ai: AiSpec;
  humanSeat?: number;
  /** Practice does not need the clock; the Daily does (FR-018). */
  timed?: boolean;
}

export interface Session {
  game: QuadroGame;
  status: SessionStatus;
  /** Bumped on every mutation; the board reads it to know it must re-render. */
  version: number;
  selection: Selection | null;
  /** Preview of the pending selection landing on `dest`, or null. */
  previewFor: (dest: number) => Preview | null;
  select: (source: number, color: number) => void;
  clearSelection: () => void;
  /** Commit the pending selection onto `dest`. Ignored when illegal. */
  place: (dest: number) => void;
  canSelect: (source: number, color: number) => boolean;
  canPlace: (dest: number) => boolean;
  restart: () => void;
  /** Elapsed milliseconds; frozen once the game ends (FR-019). */
  elapsedMs: number;
  humanSeat: number;
  humanWon: boolean;
  events: GameEvent[];
  aiMode: AiMode;
  /** Set when the AI could not produce a move at all; the attempt is dead. */
  error: string | null;
}

export function useGameSession(options: SessionOptions): Session {
  const { newGame, ai, humanSeat = 0, timed = true } = options;

  const gameRef = useRef<QuadroGame | null>(null);
  if (gameRef.current === null) gameRef.current = newGame();

  const aiRef = useRef<AiClient | null>(null);
  /**
   * Built on demand rather than in the body: React may run the unmount cleanup
   * and then keep the same refs (StrictMode does exactly this in development),
   * so the client has to be re-creatable at any point.
   */
  const getAi = useCallback(() => (aiRef.current ??= new AiClient(ai)), [ai]);

  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  /** Guards against a stale AI reply landing after a restart. */
  const generation = useRef(0);
  /** Guards against two overlapping AI turns (StrictMode runs effects twice). */
  const aiRunning = useRef(false);

  const game = gameRef.current;
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(
    () => () => {
      aiRef.current?.dispose();
      aiRef.current = null;
      aiRunning.current = false;
    },
    [],
  );

  // ---- clock -------------------------------------------------------

  useEffect(() => {
    if (!timed || startedAt === null || stoppedAt !== null) return;
    // An interval rather than requestAnimationFrame: rAF stops in a background
    // tab, and the displayed time would then sit still while the clock that
    // actually gets submitted keeps running. 50ms is smooth enough for a
    // millisecond readout.
    const tick = () => setElapsedMs(performance.now() - startedAt);
    tick();
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [timed, startedAt, stoppedAt]);

  const finish = useCallback(() => {
    // Stamped from the same clock the ticker uses, so the recorded time is the
    // one the player watched (AC-013).
    setStoppedAt((prev) => {
      if (prev !== null) return prev;
      const at = performance.now();
      setElapsedMs(startedAt === null ? 0 : at - startedAt);
      return at;
    });
    setStatus('game-over');
  }, [startedAt]);

  // ---- the AI's turn ------------------------------------------------

  const runAiTurn = useCallback(async () => {
    if (aiRunning.current) return;
    aiRunning.current = true;
    const myGeneration = generation.current;
    setStatus('ai-thinking');
    try {
      // The AI may take several turns in a row when a round boundary hands it
      // the lead, so this loops until it is the human's move again.
      while (
        gameRef.current &&
        !gameRef.current.isOver() &&
        gameRef.current.state.current !== humanSeat
      ) {
        const move = await getAi().choose(
          gameRef.current.state,
          gameRef.current.state.current,
        );
        if (generation.current !== myGeneration) return; // restarted mid-search
        gameRef.current.step(move.action);
        bump();
      }
    } catch (err) {
      if (err instanceof AiDisposed || generation.current !== myGeneration) return;
      setError((err as Error).message);
      setStatus('game-over');
      return;
    } finally {
      aiRunning.current = false;
    }
    if (generation.current !== myGeneration) return;
    if (gameRef.current!.isOver()) finish();
    else setStatus('your-turn');
  }, [bump, finish, getAi, humanSeat]);

  // Practice deals the starting seat at random, so the opponent may open the
  // game. The Daily never does: it pins the human to seat 0 (A-001).
  useEffect(() => {
    if (status !== 'idle') return;
    if (game.isOver() || game.state.current === humanSeat) return;
    void runAiTurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, humanSeat, runAiTurn, version]);

  // ---- the player's turn --------------------------------------------

  const legal = useMemo(
    () => (game.isOver() ? [] : legalActions(game.state)),
    // `version` is the dependency that matters: the state object is mutated in
    // place, so identity never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, version, status],
  );

  const humansTurn =
    (status === 'idle' || status === 'your-turn') && game.state.current === humanSeat;

  const canSelect = useCallback(
    (source: number, color: number) =>
      humansTurn && legal.some((a) => a.source === source && a.color === color),
    [humansTurn, legal],
  );

  const canPlace = useCallback(
    (dest: number) =>
      humansTurn &&
      selection !== null &&
      legal.some(
        (a) => a.source === selection.source && a.color === selection.color && a.dest === dest,
      ),
    [humansTurn, legal, selection],
  );

  const select = useCallback(
    (source: number, color: number) => {
      if (!canSelect(source, color)) return;
      setSelection((prev) =>
        prev && prev.source === source && prev.color === color ? null : { source, color },
      );
    },
    [canSelect],
  );

  const clearSelection = useCallback(() => setSelection(null), []);

  const previewFor = useCallback(
    (dest: number): Preview | null => {
      if (!selection) return null;
      const action = new Action(selection.source, selection.color, dest);
      if (!isLegal(game.state, action)) return null;
      return preview(game.state, action);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, selection, version],
  );

  const place = useCallback(
    (dest: number) => {
      if (!selection || !canPlace(dest)) return;
      // The clock starts on the player's first committed action, never before
      // (FR-018, AC-013).
      if (startedAt === null) setStartedAt(performance.now());

      game.step(new Action(selection.source, selection.color, dest));
      setSelection(null);
      bump();

      if (game.isOver()) finish();
      else if (game.state.current !== humanSeat) void runAiTurn();
      else setStatus('your-turn');
    },
    [bump, canPlace, finish, game, humanSeat, runAiTurn, selection, startedAt],
  );

  // ---- restart -------------------------------------------------------

  const restart = useCallback(() => {
    generation.current += 1;
    aiRef.current?.dispose();
    aiRef.current = null;
    gameRef.current = newGame();
    setSelection(null);
    setError(null);
    setStartedAt(null);
    setStoppedAt(null);
    setElapsedMs(0);
    setStatus('idle');
    bump();
  }, [bump, newGame]);

  const result = game.isOver() ? game.result() : null;

  return {
    game,
    status,
    version,
    selection,
    previewFor,
    select,
    clearSelection,
    place,
    canSelect,
    canPlace,
    restart,
    elapsedMs,
    humanSeat,
    humanWon: result !== null && !result.draw && result.winner === humanSeat,
    events: game.events,
    aiMode: aiRef.current?.mode ?? 'worker',
    error,
  };
}

export { CENTER, PENALTY_DEST };
