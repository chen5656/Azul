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
import { randomAgentSeed } from '../ai';
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
  /**
   * Elapsed milliseconds. Only meaningful once the game is over (FR-019) — it
   * is stamped by `finish`, not ticked. For a live readout use `startedAt`.
   */
  elapsedMs: number;
  /**
   * `performance.now()` at the player's first committed move, or null before
   * it. Whoever draws a running clock ticks off this itself, so the tick does
   * not re-render the game.
   */
  startedAt?: number | null;
  /** `performance.now()` at the end of the game, or null while it runs. */
  stoppedAt?: number | null;
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
  /**
   * The opponent's seed for this attempt, redrawn on every restart so replaying
   * one deal does not replay one game (`randomAgentSeed`). Held here rather
   * than in the spec because `AiClient` is disposable — StrictMode and the
   * worker fallback can both rebuild it mid-game, and the opponent must not
   * change personality when they do. A caller that pins `ai.seed` still gets
   * exactly the agent it asked for.
   */
  const attemptSeedRef = useRef(randomAgentSeed());
  const getAi = useCallback(
    () => (aiRef.current ??= new AiClient({ ...ai, seed: ai.seed ?? attemptSeedRef.current })),
    [ai],
  );

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

  // No ticker here on purpose. `elapsedMs` is stamped once, by `finish`, and is
  // what gets submitted; the running readout is the Timer's own business (see
  // `startedAt` below). A ticker at this level re-rendered the whole page —
  // board, avatars, the lot — 20 times a second for as long as a game sat open,
  // which cost real CPU on a game nobody was playing.

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

  /**
   * Start the opponent's search now that the position is settled, so it runs
   * under the settlement animation instead of after it.
   *
   * The counterpart to the prefetch in `place`, for the turns that cross a round
   * boundary: there the question only becomes knowable once the round has been
   * settled and the next one dealt, which `step` has just done.
   */
  const maybePrefetchAi = useCallback(() => {
    const current = gameRef.current;
    if (!current || current.isOver() || current.state.current === humanSeat) return;
    getAi().prefetch(current.state, current.state.current);
  }, [getAi, humanSeat]);

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

        // The board the settlement animation plays on: the draft applied, the
        // round not yet settled.
        const postDraft = beforeState.clone();
        applyAction(postDraft, move.action);

        // A round boundary can hand the AI two moves in a row; the second one
        // gets to think under the first one's animation, as the player's does.
        if (!postDraft.draftingDone() && postDraft.current !== humanSeat) {
          getAi().prefetch(postDraft, postDraft.current);
        }

        if (animatorRef.current?.isEnabled()) {
          await animateDraft(animatorRef.current, beforeState, move.action, currentSeat);
          if (generation.current !== myGeneration) return;
        }

        const events = gameRef.current.step(move.action);
        if (gameRef.current.state.round_num !== roundBefore || gameRef.current.isOver()) {
          historyRef.current = [];
        }
        bump();
        maybePrefetchAi();

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
  }, [bump, finish, getAi, humanSeat, maybePrefetchAi, playSettlement]);

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

      // The board the settlement animation plays on: the draft applied, the
      // round not yet settled.
      const postDraft = beforeState.clone();
      applyAction(postDraft, action);

      // Committing the move already fixes the question the opponent will be
      // asked, so let it start thinking under the player's own animation rather
      // than after it. Only when the round does not turn over in between — a
      // settlement would deal new tiles and change the question.
      if (!postDraft.draftingDone() && postDraft.current !== humanSeat) {
        getAi().prefetch(postDraft, postDraft.current);
      }

      if (animatorRef.current?.isEnabled()) {
        await animateDraft(animatorRef.current, beforeState, action, humanSeat);
        if (generation.current !== myGeneration) return;
      }

      const events = game.step(action);
      if (game.state.round_num !== roundBefore || game.isOver()) {
        historyRef.current = [];
      }
      bump();
      maybePrefetchAi();

      if (animatorRef.current) {
        await playSettlement(postDraft, events, myGeneration);
        if (generation.current !== myGeneration) return;
      }

      if (game.isOver()) finish();
      else if (game.state.current !== humanSeat) void runAiTurn();
      else setStatus('your-turn');
    },
    [
      bump,
      canPlace,
      finish,
      game,
      getAi,
      humanSeat,
      maybePrefetchAi,
      playSettlement,
      runAiTurn,
      selection,
      startedAt,
      status,
    ],
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
    attemptSeedRef.current = randomAgentSeed();
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
    startedAt: timed ? startedAt : null,
    stoppedAt,
    humanSeat,
    humanWon: result !== null && !result.draw && result.winner === humanSeat,
    events: game.events,
    aiMode: aiRef.current?.mode ?? 'worker',
    error,
    setAnimator,
  };
}

export { CENTER, PENALTY_DEST };
