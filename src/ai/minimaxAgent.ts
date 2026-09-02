/**
 * Alpha-beta within the round — every level from `medium` up to `master`, which
 * differ only in how deep and how wide they are allowed to look.
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
import { type Agent, type AgentLevel, AgentError, choice } from './base';
import { AI_SAFETY_CAP_MS } from './budget';
import { now } from './clock';
import { rngForPosition } from './position';
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';
import { actionValue } from './greedyAgent';

const INF = Infinity;

/** Thrown to unwind the search when the safety cap passes mid-node. */
class SearchCapped extends Error {}

/** Search depth per alpha-beta level. */
export const MINIMAX_DEPTHS = { medium: 2, hard: 3, expert: 4, master: 5 } as const;
export type MinimaxLevel = keyof typeof MINIMAX_DEPTHS;

/**
 * Children searched per node.
 *
 * Only `master` narrows. At a branching factor of 30-80 a full-width depth 5
 * costs seconds in the worst positions, so `master` searches the eight
 * best-ordered moves to afford its extra ply; the shallower levels can carry
 * full width and are stronger for it.
 *
 * Narrowing every level was tried (it is what buys a depth guarantee without a
 * clock, and it collapses the cost tail by roughly an order of magnitude) and
 * reverted: at depth 2-4 a beam of 12-20 drops too many of the blocking moves
 * that live low in the move ordering, and the opponent played visibly softer.
 * Full width is the strength; the deep level is the one that pays for depth.
 */
export const MINIMAX_WIDTHS: Partial<Record<MinimaxLevel, number>> = { master: 8 };

function levelForDepth(depth: number): AgentLevel {
  if (depth <= 2) return 'medium';
  if (depth === 3) return 'hard';
  return depth === 4 ? 'expert' : 'master';
}

export class MinimaxAgent implements Agent {
  readonly level: AgentLevel;
  nodes = 0;
  reachedDepth = 0;
  /** True when the last `choose` hit the safety cap and answered short of `depth`. */
  cappedOut = false;

  /** Base seed; the RNG itself is derived per position (see `./position`). */
  private readonly seed: number;
  private deadline = Infinity;

  constructor(
    seed?: number,
    private readonly depth = 4,
    /**
     * Milliseconds after which the search gives up and answers from the deepest
     * ply it finished. This is a stop-loss for pathological devices, not the
     * budget: strength is `depth`, and every level is sized to complete it.
     */
    private readonly safetyCapMs = AI_SAFETY_CAP_MS,
    private readonly weights: Weights = DEFAULT_WEIGHTS,
    level: AgentLevel = levelForDepth(depth),
    /** children searched per node; the whole tree is searched by default */
    private readonly width = Infinity,
  ) {
    this.seed = seed ?? new Rng().nextInt(2 ** 31);
    this.level = level;
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
    const ordered = scored.map(([, a]) => a);
    return Number.isFinite(this.width) ? ordered.slice(0, this.width) : ordered;
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
    if (now() > this.deadline) throw new SearchCapped();
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

    this.deadline = now() + this.safetyCapMs;
    this.nodes = 0;
    this.cappedOut = false;
    const scratch = state.clone();
    let ordering = this.ordered(scratch);
    // Depth 1 is already answered by the ordering pass, so even a cap tripped
    // in the first node leaves a legal, non-arbitrary move to return (FR-009).
    let chosen = ordering.slice(0, 1);
    this.reachedDepth = 1;

    // Iterative deepening: every completed depth replaces the answer, and the
    // previous depth's values reorder the root for the next one.
    for (let depth = 2; depth <= this.depth; depth += 1) {
      let best: Action[];
      let values: [number, Action][];
      try {
        [best, values] = this.root(scratch, player, depth, ordering);
      } catch (err) {
        if (err instanceof SearchCapped) {
          this.cappedOut = true;
          break;
        }
        throw err;
      }
      chosen = best;
      this.reachedDepth = depth;
      values.sort((x, y) => y[0] - x[0]);
      ordering = values.map(([, a]) => a);
    }

    // Ties are common and the tie-break must not depend on how many searches
    // this agent has run before; deriving the RNG from the position keeps the
    // whole reply a function of the position alone.
    if (chosen.length === 1) return chosen[0];
    return choice(rngForPosition(this.seed, state, player), chosen);
  }
}
