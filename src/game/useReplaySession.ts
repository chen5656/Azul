/**
 * Drives a recorded game, for the shared-replay page.
 *
 * Deliberately returns the same `Session` shape as `useGameSession`, so the
 * replay is drawn by the real `Board` — the same tiles, the same flight
 * animation, the same round settlement — rather than by a second renderer that
 * would drift from the game it claims to show. Interaction is simply switched
 * off: `canSelect`/`canPlace` answer false and `place` is a no-op.
 *
 * No agent runs here: the opponent's moves come from the record. That is what
 * makes playback faithful even if the agents later change, or if the original
 * search was cut short by the safety cap (see `src/replay/codec.ts`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Action,
  type GameEvent,
  type GameState,
  QuadroGame,
  applyAction,
} from '../engine';
import { type Animator, animateDraft, animateSettlement } from '../components/animator';
import type { Session, SessionStatus } from './useGameSession';
import type { Replay } from '../replay/codec';
import { replayGame } from '../replay/rebuild';

export type ReplayStatus = 'paused' | 'playing' | 'ended' | 'error';

export interface ReplayControls {
  session: Session;
  status: ReplayStatus;
  /** How many of the recorded actions have been applied. */
  cursor: number;
  total: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  /** Apply the next action; pauses playback first. */
  stepForward: () => void;
  /** Rebuild from the start up to `index`, skipping animation. */
  seek: (index: number) => void;
  restart: () => void;
  speed: number;
  setSpeed: (multiplier: number) => void;
  /** Set when the record and the engine disagree; playback stops. */
  error: string | null;
  /** Round number each action belongs to, for a segmented scrubber. */
  roundAt: number[];
}

/** Beat between moves at 1x, so a viewer can follow what happened. */
const STEP_DELAY_MS = 900;

export function useReplaySession(replay: Replay): ReplayControls {
  const gameRef = useRef<QuadroGame | null>(null);
  if (gameRef.current === null) gameRef.current = replayGame(replay);

  const displayRef = useRef<GameState | null>(null);
  const animatorRef = useRef<Animator | null>(null);
  const setAnimator = useCallback((animator: Animator | null) => {
    animatorRef.current = animator;
  }, []);

  const [version, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  /** Bumped on every rebuild, so an in-flight animation abandons its writes. */
  const generation = useRef(0);
  const stepping = useRef(false);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const game = gameRef.current;

  /**
   * Which round each recorded action falls in. Computed once by running the
   * replay silently, so the scrubber can show round boundaries without the
   * component re-deriving it on every render.
   */
  const roundAt = useMemo(() => {
    const probe = replayGame(replay);
    const rounds: number[] = [];
    for (const id of replay.actions) {
      if (probe.isOver()) break;
      rounds.push(probe.state.round_num);
      try {
        probe.step(Action.fromId(id));
      } catch {
        break;
      }
    }
    return rounds;
  }, [replay]);

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

  /**
   * Apply one recorded action, animated exactly as a live move is.
   *
   * Returns false when there is nothing left to play or the record failed, so
   * the playback loop knows to stop rather than spin.
   */
  const advance = useCallback(
    async (animate: boolean): Promise<boolean> => {
      if (stepping.current) return false;
      const current = gameRef.current;
      if (!current || current.isOver()) return false;

      const index = current.history.length;
      const id = replay.actions[index];
      if (id === undefined) return false;

      stepping.current = true;
      const myGeneration = generation.current;
      try {
        const action = Action.fromId(id);
        const mover = current.state.current;
        const beforeState = current.state.clone();

        if (animate && animatorRef.current?.isEnabled()) {
          await animateDraft(animatorRef.current, beforeState, action, mover);
          if (generation.current !== myGeneration) return false;
        }

        const postDraft = beforeState.clone();
        applyAction(postDraft, action);

        let events: GameEvent[];
        try {
          events = current.step(action);
        } catch {
          // The record disagrees with the engine. Stop rather than show a board
          // that never existed.
          setError(
            `This replay could not be played back: move ${index + 1} is not legal in the position it reached.`,
          );
          setPlaying(false);
          return false;
        }
        setCursor(current.history.length);
        bump();

        if (animate && animatorRef.current) {
          await playSettlement(postDraft, events, myGeneration);
          if (generation.current !== myGeneration) return false;
        }
        return !current.isOver();
      } finally {
        stepping.current = false;
      }
    },
    [bump, playSettlement, replay.actions],
  );

  // ---- playback loop -------------------------------------------------

  useEffect(() => {
    if (!playing || error) return;
    let cancelled = false;
    const myGeneration = generation.current;

    (async () => {
      while (!cancelled && generation.current === myGeneration) {
        const more = await advance(true);
        if (cancelled || generation.current !== myGeneration) return;
        if (!more) {
          setPlaying(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, STEP_DELAY_MS / speed));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playing, speed, error, advance]);

  // ---- controls ------------------------------------------------------

  const reset = useCallback(
    (upTo: number) => {
      generation.current += 1;
      animatorRef.current?.clear();
      displayRef.current = null;
      setPlaying(false);
      setError(null);

      const rebuilt = replayGame(replay);
      for (let i = 0; i < upTo && i < replay.actions.length; i += 1) {
        if (rebuilt.isOver()) break;
        try {
          rebuilt.step(Action.fromId(replay.actions[i]));
        } catch {
          setError(`This replay could not be played back: move ${i + 1} is not legal.`);
          break;
        }
      }
      gameRef.current = rebuilt;
      setCursor(rebuilt.history.length);
      bump();
    },
    [bump, replay],
  );

  const controls: ReplayControls = {
    status: error ? 'error' : game.isOver() ? 'ended' : playing ? 'playing' : 'paused',
    cursor,
    total: replay.actions.length,
    playing,
    play: useCallback(() => {
      if (gameRef.current?.isOver()) return;
      setPlaying(true);
    }, []),
    pause: useCallback(() => setPlaying(false), []),
    stepForward: useCallback(() => {
      setPlaying(false);
      void advance(true);
    }, [advance]),
    seek: useCallback((index: number) => reset(index), [reset]),
    restart: useCallback(() => reset(0), [reset]),
    speed,
    setSpeed,
    error,
    roundAt,
    session: {
      game,
      displayState: displayRef.current ?? game.state,
      // The board dims the "waiting" side from this; a replay has no thinking
      // opponent, so it always reads as a settled position.
      status: (game.isOver() ? 'game-over' : 'your-turn') as SessionStatus,
      version,
      selection: null,
      previewFor: () => null,
      select: () => {},
      clearSelection: () => {},
      place: () => {},
      canSelect: () => false,
      canPlace: () => false,
      restart: () => reset(0),
      undo: () => {},
      canUndo: false,
      undosRemaining: 0,
      maxUndos: 0,
      elapsedMs: 0,
      humanSeat: replay.humanSeat,
      humanWon: game.isOver() ? game.result().winner === replay.humanSeat : false,
      events: game.events,
      aiMode: 'worker',
      error: null,
      setAnimator,
    },
  };

  return controls;
}
