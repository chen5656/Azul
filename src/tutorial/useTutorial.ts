/**
 * Drives the scripted lesson.
 *
 * It produces a `Session`, so `Board` / `DisplayArea` / `PlayerBoard` render the
 * tutorial exactly as they render a real game — the learner is taught the real
 * interface, not a mock-up of it.
 *
 * Two things differ from `useGameSession`:
 *
 *  - `canSelect` / `canPlace` are narrowed to the current step's one legal move.
 *    Everything else on the board disables itself, which is what turns the
 *    existing dimming into a spotlight with no component changes.
 *  - The opponent runs synchronously on the main thread. Greedy costs under 5ms
 *    and is seeded, so the lesson never awaits a worker and never varies. The
 *    reply is still delayed by `AI_PAUSE` so the learner sees it happen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Action,
  type Preview,
  QuadroGame,
  isLegal,
  legalActions,
  preview,
} from '../engine';
import { GreedyAgent } from '../ai';
import type { Session, Selection } from '../game/useGameSession';
import {
  type MoveStep,
  OPPONENT_LABEL,
  STEPS,
  type Spotlight,
  type Step,
  TUTORIAL_FIRST_PLAYER,
  TUTORIAL_HUMAN_SEAT,
  TUTORIAL_OPPONENT_SEED,
  TUTORIAL_SEED,
} from './script';

/** How long the opponent's reply is held back, purely so it is watchable. */
const AI_PAUSE = 700;

/** Where a move step is within its own two clicks. */
export type Phase = 'pick' | 'place' | 'replying' | 'after';

export interface Tutorial {
  session: Session;
  step: Step;
  stepIndex: number;
  stepCount: number;
  phase: Phase;
  /** The paragraphs to show right now, chosen from the step and the phase. */
  body: string[];
  /** True when the learner may move on: talk steps always, move steps once played. */
  canAdvance: boolean;
  next: () => void;
  /** Back to step 1 with a fresh deal. */
  restart: () => void;
  done: boolean;
}

function makeGame(): QuadroGame {
  return new QuadroGame(TUTORIAL_SEED, TUTORIAL_FIRST_PLAYER);
}

/** The action a move step demands, or null on a talk step. */
function required(step: Step): Action | null {
  return step.kind === 'move' ? new Action(step.source, step.color, step.dest) : null;
}

export function useTutorial(): Tutorial {
  const gameRef = useRef<QuadroGame | null>(null);
  if (gameRef.current === null) gameRef.current = makeGame();
  const game = gameRef.current;

  const [version, setVersion] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('pick');
  const [selection, setSelection] = useState<Selection | null>(null);
  /** Invalidates a pending opponent reply across a restart. */
  const generation = useRef(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const step = STEPS[stepIndex];
  const done = stepIndex >= STEPS.length - 1;

  // Plain greedy, not a difficulty level: the scripted deal was authored
  // against its replies, so the tutorial must not drift when the levels move.
  const opponent = useMemo(() => new GreedyAgent(TUTORIAL_OPPONENT_SEED), []);

  // ---- gating -------------------------------------------------------

  const want = useMemo(() => required(step), [step]);

  const legal = useMemo(
    () => (game.isOver() ? [] : legalActions(game.state)),
    // The state is mutated in place, so `version` is the dependency that counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, version],
  );

  const open = want !== null && (phase === 'pick' || phase === 'place');

  const canSelect = useCallback(
    (source: number, color: number) =>
      open &&
      want!.source === source &&
      want!.color === color &&
      legal.some((a) => a.source === source && a.color === color),
    [legal, open, want],
  );

  const canPlace = useCallback(
    (dest: number) =>
      open &&
      selection !== null &&
      want!.dest === dest &&
      legal.some(
        (a) => a.source === selection.source && a.color === selection.color && a.dest === dest,
      ),
    [legal, open, selection, want],
  );

  const select = useCallback(
    (source: number, color: number) => {
      if (!canSelect(source, color)) return;
      setSelection((prev) => {
        const same = prev && prev.source === source && prev.color === color;
        setPhase(same ? 'pick' : 'place');
        return same ? null : { source, color };
      });
    },
    [canSelect],
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
    setPhase((p) => (p === 'place' ? 'pick' : p));
  }, []);

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

  // ---- the opponent --------------------------------------------------

  /**
   * Play the opponent's answer, then hand the step to its `after` text. The
   * opponent may owe several moves in a row when a round boundary gives it the
   * lead, so this loops until it is the learner's turn again.
   */
  const reply = useCallback(() => {
    const mine = generation.current;
    window.setTimeout(() => {
      if (generation.current !== mine) return;
      while (!game.isOver() && game.state.current !== TUTORIAL_HUMAN_SEAT) {
        game.step(opponent.choose(game.state, game.state.current));
      }
      bump();
      setPhase('after');
    }, AI_PAUSE);
  }, [bump, game, opponent]);

  const place = useCallback(
    (dest: number) => {
      if (!selection || !canPlace(dest)) return;
      game.step(new Action(selection.source, selection.color, dest));
      setSelection(null);
      setPhase('replying');
      bump();
      reply();
    },
    [bump, canPlace, game, reply, selection],
  );

  // ---- stepping ------------------------------------------------------

  const canAdvance = step.kind === 'talk' || phase === 'after';

  const next = useCallback(() => {
    if (!canAdvance) return;
    setStepIndex((i) => {
      const to = Math.min(i + 1, STEPS.length - 1);
      setPhase(STEPS[to].kind === 'move' ? 'pick' : 'after');
      return to;
    });
  }, [canAdvance]);

  const restart = useCallback(() => {
    generation.current += 1;
    gameRef.current = makeGame();
    setStepIndex(0);
    setPhase(STEPS[0].kind === 'move' ? 'pick' : 'after');
    setSelection(null);
    bump();
  }, [bump]);

  // A talk step has no click to make, so it is 'after' from the moment it opens.
  useEffect(() => {
    if (step.kind === 'talk') setPhase('after');
  }, [step]);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const spotlight: Spotlight | undefined = useMemo(() => {
    if (step.kind === 'talk') return step.spotlight;
    if (phase === 'pick') return { kind: 'source', index: step.source };
    if (phase === 'place' || phase === 'replying' || phase === 'after') {
      return step.dest === 5 ? { kind: 'floor' } : { kind: 'row', index: step.dest };
    }
    return undefined;
  }, [phase, step]);

  const body = useMemo(() => {
    if (step.kind === 'talk') return step.body;
    const move = step as MoveStep;
    if (phase === 'pick') return move.pick;
    if (phase === 'place') return move.place;
    if (phase === 'replying') return [`${OPPONENT_LABEL} is answering…`];
    return move.after;
  }, [phase, step]);

  const session: Session = {
    game,
    // The tutorial never animates a settlement, so the board is always the
    // engine's own state.
    displayState: game.state,
    // The board only reads `status` to decide which side to outline and whether
    // rows are live; the tutorial's phases map onto it cleanly.
    status: phase === 'replying' ? 'ai-thinking' : open ? 'your-turn' : 'idle',
    version,
    selection,
    previewFor,
    select,
    clearSelection,
    place,
    canSelect,
    canPlace,
    restart,
    undo: () => {},
    canUndo: false,
    undosRemaining: 0,
    maxUndos: 0,
    elapsedMs: 0,
    humanSeat: TUTORIAL_HUMAN_SEAT,
    humanWon: false,
    events: game.events,
    aiMode: 'main-thread',
    error: null,
    spotlight,
  };

  return {
    session,
    step,
    stepIndex,
    stepCount: STEPS.length,
    phase,
    body,
    canAdvance,
    next,
    restart,
    done,
  };
}
