/**
 * QuadroGame: the round-by-round driver on top of `rules`.
 *
 * Owns the bag, fills the displays each round, and turns a stream of actions
 * into a stream of events. AI search does not use this class — it works on
 * `GameState` through `rules` directly.
 */

import { DISPLAY_SIZE, MAX_ROUNDS, NUM_COLORS } from './constants';
import type { GameEvent, RoundStart } from './events';
import { applyAction, decideWinner, isLegal, legalActions, settleRound } from './rules';
import { Action, GAME_OVER, GameState } from './state';
import { Rng } from './rng';

export class IllegalAction extends Error {}

export interface GameResult {
  scores: number[];
  winner: number | null;
  draw: boolean;
  complete_rows: number[];
  rounds: number;
}

/**
 * Draw one tile from the bag, refilling from the discard pile if needed.
 *
 * Returns null only when bag and discard are both empty, in which case the
 * display is simply left short and the round proceeds. This is the engine's
 * *only* consumer of randomness.
 */
export function drawTile(state: GameState): number | null {
  let total = state.bag.reduce((a, b) => a + b, 0);
  if (total === 0) {
    if (!state.discard.some((n) => n > 0)) return null;
    for (let color = 0; color < NUM_COLORS; color += 1) {
      state.bag[color] += state.discard[color];
      state.discard[color] = 0;
    }
    total = state.bag.reduce((a, b) => a + b, 0);
  }

  let pick = state.rng.nextInt(total);
  for (let color = 0; color < NUM_COLORS; color += 1) {
    pick -= state.bag[color];
    if (pick < 0) {
      state.bag[color] -= 1;
      return color;
    }
  }
  throw new Error('unreachable: weighted draw fell through');
}

/** Fill every display from the bag and hand the token to the center. */
export function startRound(state: GameState): RoundStart {
  let refilled = false;
  let short = 0;
  for (const display of state.displays) {
    let filled = 0;
    for (let i = 0; i < DISPLAY_SIZE; i += 1) {
      const beforeEmpty = state.bag.reduce((a, b) => a + b, 0) === 0;
      const color = drawTile(state);
      if (color === null) break;
      if (beforeEmpty) refilled = true;
      display[color] += 1;
      filled += 1;
    }
    if (filled < DISPLAY_SIZE) short += 1;
  }

  state.center_has_token = true;
  state.current = state.first_player;
  for (const board of state.players) board.has_first_token = false;

  return {
    kind: 'round_start',
    round_num: state.round_num,
    first_player: state.first_player,
    bag_refilled: refilled,
    short_displays: short,
  };
}

/**
 * Close the finished round and deal the next one, unless the game just ended.
 *
 * The AI search drives states directly rather than through `QuadroGame`, so the
 * round boundary lives here where both callers share it.
 */
export function settleAndDeal(state: GameState): GameEvent[] {
  const events = settleRound(state);
  if (state.phase === GAME_OVER) return events;
  const holderIndex = state.players.findIndex((p) => p.has_first_token);
  state.first_player = holderIndex >= 0 ? holderIndex : state.first_player;
  state.round_num += 1;
  if (state.round_num > MAX_ROUNDS) {
    throw new Error('round cap exceeded; the game failed to terminate');
  }
  events.push(startRound(state));
  return events;
}

export class QuadroGame {
  readonly seed: number;
  readonly state: GameState;
  readonly history: Action[] = [];
  readonly events: GameEvent[];

  /**
   * `firstPlayer` is drawn from the seed unless given. The Daily pins it to seat
   * 0 (BUILD-SPEC A-001) and so passes it explicitly.
   */
  constructor(seed?: number, firstPlayer?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2 ** 31);
    this.state = new GameState(new Rng(this.seed));
    this.state.first_player = firstPlayer ?? this.state.rng.nextInt(2);
    this.events = [startRound(this.state)];
  }

  // ---- queries -----------------------------------------------------

  legalActions(): Action[] {
    return legalActions(this.state);
  }

  isOver(): boolean {
    return this.state.phase === GAME_OVER;
  }

  get current(): number {
    return this.state.current;
  }

  result(): GameResult {
    const [winner, draw] = decideWinner(this.state);
    return {
      scores: this.state.players.map((p) => p.score),
      winner,
      draw,
      complete_rows: this.state.players.map((p) => p.completeRows()),
      rounds: this.state.round_num,
    };
  }

  // ---- driving -----------------------------------------------------

  /** Apply one action, settling the round and dealing the next if needed. */
  step(action: Action): GameEvent[] {
    if (this.state.phase === GAME_OVER) throw new IllegalAction('the game is over');
    if (!isLegal(this.state, action)) {
      throw new IllegalAction(`illegal action: ${action.describe()}`);
    }

    const undo = applyAction(this.state, action);
    this.history.push(action);
    const events: GameEvent[] = [undo.event];

    if (this.state.draftingDone()) events.push(...settleAndDeal(this.state));

    this.events.push(...events);
    return events;
  }

  clone(): QuadroGame {
    const copy = new QuadroGame(this.seed, this.state.first_player);
    (copy as { state: GameState }).state = this.state.clone();
    (copy as { history: Action[] }).history = this.history.map(
      (a) => new Action(a.source, a.color, a.dest),
    );
    (copy as { events: GameEvent[] }).events = this.events.slice();
    return copy;
  }
}
