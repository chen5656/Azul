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
  type GameState,
  PENALTY_DEST,
  type Preview,
  QuadroGame,
  applyAction,
  isLegal,
  legalActions,
  preview,
} from '../engine';
import { AiClient, AiDisposed, type AiMode, type AiSpec } from './aiClient';
import type { Spotlight } from '../tutorial/script';
import config from '../config';
import { type Animator, animateDraft, animateSettlement } from '../components/animator';

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
  /** Maximum number of undos allowed per game. Defaults to config.json. */
  maxUndos?: number;
}

export interface Session {
  game: QuadroGame;
  /**
   * What the board must draw. Normally `game.state`, but during a round
   * settlement it is a stand-in that the animation advances one scored tile at
   * a time — the engine has already settled the whole round by then.
   */
  displayState: GameState;
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
  undo: () => void;
  canUndo: boolean;
  undosRemaining: number;
  maxUndos: number;
  /** Elapsed milliseconds; frozen once the game ends (FR-019). */
  elapsedMs: number;
  humanSeat: number;
  humanWon: boolean;
  events: GameEvent[];
  aiMode: AiMode;
  /** Set when the AI could not produce a move at all; the attempt is dead. */
  error: string | null;
  /** Attach animator for turn and settlement animations. */
  setAnimator?: (animator: Animator | null) => void;
  /**
   * Set only by the tutorial (`src/tutorial`), which rings one part of the board
   * while a lesson step is open. A real game never sets it and the board falls
   * back to its normal appearance.
   */
  spotlight?: Spotlight;
}

export function useGameSession(options: SessionOptions): Session {
  const { newGame, ai, humanSeat = 0, timed = true } = options;

  const gameRef = useRef<QuadroGame | null>(null);
  if (gameRef.current === null) gameRef.current = newGame();

  /**
   * Non-null only while a settlement is being animated; see `displayState`.
   */
  const displayRef = useRef<GameState | null>(null);

  const animatorRef = useRef<Animator | null>(null);
  const setAnimator = useCallback((animator: Animator | null) => {
    animatorRef.current = animator;
  }, []);

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
  const [undosRemaining, setUndosRemaining] = useState(options.maxUndos ?? config.maxUndos);
  const historyRef = useRef<Array<{ game: QuadroGame; status: SessionStatus }>>([]);
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

  /**
   * Play the round settlement out on a stand-in board so it can be watched.
   *
   * `postDraft` is the state the player was looking at when the last tile
   * landed. It is what stays on screen while each staging row is scored in
   * turn; the real state — already settled and already dealt the next round —
   * takes over once the last tile is home.
   */
  const playSettlement = useCallback(
    async (postDraft: GameState, events: GameEvent[], myGeneration: number) => {
      const animator = animatorRef.current;
      if (!animator) return;
      displayRef.current = postDraft;
      bump();
      try {
        await animateSettlement(animator, events, postDraft, bump);
      } finally {
        if (generation.current === myGeneration) {
          displayRef.current = null;
          bump();
        }
      }
    },
    [bump],
  );

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
        const roundBefore = gameRef.current.state.round_num;
        const currentSeat = gameRef.current.state.current;
        const move = await getAi().choose(
          gameRef.current.state,
          currentSeat,
        );
        if (generation.current !== myGeneration) return; // restarted mid-search

        const beforeState = gameRef.current.state.clone();
        if (animatorRef.current?.isEnabled()) {
          await animateDraft(animatorRef.current, beforeState, move.action, currentSeat);
          if (generation.current !== myGeneration) return;
        }

        // The board the settlement animation plays on: the draft applied, the
        // round not yet settled.
        const postDraft = beforeState.clone();
        applyAction(postDraft, move.action);

        const events = gameRef.current.step(move.action);
        if (gameRef.current.state.round_num !== roundBefore || gameRef.current.isOver()) {
          historyRef.current = [];
        }
        bump();

        if (animatorRef.current) {
          await playSettlement(postDraft, events, myGeneration);
          if (generation.current !== myGeneration) return;
        }
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
  }, [bump, finish, getAi, humanSeat, playSettlement]);

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
    async (dest: number) => {
      if (!selection || !canPlace(dest)) return;
      const myGeneration = generation.current;
      const action = new Action(selection.source, selection.color, dest);

      // The clock starts on the player's first committed action, never before
      // (FR-018, AC-013).
      if (startedAt === null) setStartedAt(performance.now());

      if (gameRef.current) {
        historyRef.current.push({
          game: gameRef.current.clone(),
          status: status === 'idle' ? 'idle' : 'your-turn',
        });
      }

      const roundBefore = game.state.round_num;
      const beforeState = game.state.clone();
      setSelection(null);

      if (animatorRef.current?.isEnabled()) {
        await animateDraft(animatorRef.current, beforeState, action, humanSeat);
        if (generation.current !== myGeneration) return;
      }

      const postDraft = beforeState.clone();
      applyAction(postDraft, action);

      const events = game.step(action);
      if (game.state.round_num !== roundBefore || game.isOver()) {
        historyRef.current = [];
      }
      bump();

      if (animatorRef.current) {
        await playSettlement(postDraft, events, myGeneration);
        if (generation.current !== myGeneration) return;
      }

      if (game.isOver()) finish();
      else if (game.state.current !== humanSeat) void runAiTurn();
      else setStatus('your-turn');
    },
    [bump, canPlace, finish, game, humanSeat, playSettlement, runAiTurn, selection, startedAt, status],
  );

  // ---- undo ----------------------------------------------------------

  const canUndo =
    undosRemaining > 0 && historyRef.current.length > 0 && status !== 'ai-thinking';

  const undo = useCallback(() => {
    if (undosRemaining <= 0 || historyRef.current.length === 0 || status === 'ai-thinking') {
      return;
    }
    const previous = historyRef.current.pop();
    if (!previous) return;

    generation.current += 1;
    displayRef.current = null;
    animatorRef.current?.clear();
    aiRef.current?.dispose();
    aiRef.current = null;
    aiRunning.current = false;

    gameRef.current = previous.game;
    setUndosRemaining((prev) => Math.max(0, prev - 1));
    setSelection(null);
    setError(null);
    if (status === 'game-over') {
      setStoppedAt(null);
    }
    setStatus(previous.status);
    bump();
  }, [bump, status, undosRemaining]);

  // ---- restart -------------------------------------------------------

  const restart = useCallback(() => {
    generation.current += 1;
    displayRef.current = null;
    animatorRef.current?.clear();
    aiRef.current?.dispose();
    aiRef.current = null;
    aiRunning.current = false;
    gameRef.current = newGame();
    historyRef.current = [];
    setUndosRemaining(options.maxUndos ?? config.maxUndos);
    setSelection(null);
    setError(null);
    setStartedAt(null);
    setStoppedAt(null);
    setElapsedMs(0);
    setStatus('idle');
    bump();
  }, [bump, newGame, options.maxUndos]);

  const result = game.isOver() ? game.result() : null;

  return {
    game,
    displayState: displayRef.current ?? game.state,
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
    undo,
    canUndo,
    undosRemaining,
    maxUndos: options.maxUndos ?? config.maxUndos,
    elapsedMs,
    humanSeat,
    humanWon: result !== null && !result.draw && result.winner === humanSeat,
    events: game.events,
    aiMode: aiRef.current?.mode ?? 'worker',
    error,
    setAnimator,
  };
}

export { CENTER, PENALTY_DEST };
