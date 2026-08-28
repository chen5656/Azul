/**
 * Level 2 — alpha-beta within the round.
 *
 * Once the displays are dealt, the rest of the round is a pure
 * perfect-information zero-sum game: no hidden tiles, no chance events until the
 * next deal. So plain minimax is exactly right here, with no information-set
 * machinery. The search stops at the round boundary, settles that node
 * precisely, and evaluates — it never guesses the next deal.
 */

import {
  type Action,
  type GameState,
  Rng,
  applyAction,
  legalActions,
  settleRound,
  undoAction,
} from '../engine';
import { type Agent, AgentError, choice } from './base';
import { now } from './clock';
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';
import { actionValue } from './greedyAgent';

const INF = Infinity;

/** Thrown to unwind the search when the deadline passes mid-node. */
class SearchTimeout extends Error {}

export class MinimaxAgent implements Agent {
  readonly level = 'minimax' as const;
  nodes = 0;
  reachedDepth = 0;

  private readonly rng: Rng;
  private deadline = Infinity;

  constructor(
    seed?: number,
    private readonly depth = 4,
    /** seconds, matching the Python agent's `time_budget` */
    private readonly timeBudget = 0.45,
    private readonly weights: Weights = DEFAULT_WEIGHTS,
  ) {
    this.rng = new Rng(seed);
  }

  // ---- search ------------------------------------------------------

  /**
   * Children sorted by their one-ply value for the side to move.
   *
   * Ordering is what makes alpha-beta pay off at a branching factor of 30-80; it
   * costs one greedy evaluation per child and saves whole subtrees.
   */
  private ordered(state: GameState): Action[] {
    const mover = state.current;
    const scored = legalActions(state).map(
      (a) => [actionValue(state, a, mover, this.weights), a] as const,
    );
    scored.sort((x, y) => y[0] - x[0]);
    return scored.map(([, a]) => a);
  }

  /** Value of a round-final node: settle a copy, then evaluate. */
  private leaf(state: GameState, player: number): number {
    const scratch = state.clone();
    settleRound(scratch);
    return evaluate(scratch, player, this.weights);
  }

  private search(
    state: GameState,
    player: number,
    depth: number,
    alpha: number,
    beta: number,
  ): number {
    if (now() > this.deadline) throw new SearchTimeout();
    this.nodes += 1;

    if (state.draftingDone()) return this.leaf(state, player);
    if (depth === 0) return evaluate(state, player, this.weights);

    const maximizing = state.current === player;
    let best = maximizing ? -INF : INF;
    for (const action of this.ordered(state)) {
      const undo = applyAction(state, action);
      let value: number;
      try {
        value = this.search(state, player, depth - 1, alpha, beta);
      } finally {
        undoAction(state, undo);
      }
      if (maximizing) {
        if (value > best) best = value;
        if (best > alpha) alpha = best;
      } else {
        if (value < best) best = value;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  /** One full-width root pass; returns the best actions and the values in search order. */
  private root(
    state: GameState,
    player: number,
    depth: number,
    ordering: Action[],
  ): [Action[], [number, Action][]] {
    let alpha = -INF;
    let best = -INF;
    let chosen: Action[] = [];
    const values: [number, Action][] = [];

    for (const action of ordering) {
      const undo = applyAction(state, action);
      let value: number;
      try {
        value = this.search(state, player, depth - 1, alpha, INF);
      } finally {
        undoAction(state, undo);
      }
      values.push([value, action]);
      if (value > best) {
        best = value;
        chosen = [action];
        alpha = value;
      } else if (value === best) {
        chosen.push(action);
      }
    }
    return [chosen, values];
  }

  choose(state: GameState, player: number): Action {
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    if (actions.length === 1) return actions[0];

    this.deadline = now() + this.timeBudget * 1000;
    this.nodes = 0;
    const scratch = state.clone();
    let ordering = this.ordered(scratch);
    // Depth 1 is already answered by the ordering pass, so an expired budget
    // still leaves a legal, non-arbitrary move to return (FR-009).
    let chosen = ordering.slice(0, 1);

    // Iterative deepening: every completed depth replaces the answer, and the
    // previous depth's values reorder the root for the next one.
    for (let depth = 2; depth <= this.depth; depth += 1) {
      let best: Action[];
      let values: [number, Action][];
      try {
        [best, values] = this.root(scratch, player, depth, ordering);
      } catch (err) {
        if (err instanceof SearchTimeout) break;
        throw err;
      }
      chosen = best;
      this.reachedDepth = depth;
      values.sort((x, y) => y[0] - x[0]);
      ordering = values.map(([, a]) => a);
    }

    return chosen.length > 1 ? choice(this.rng, chosen) : chosen[0];
  }
}
