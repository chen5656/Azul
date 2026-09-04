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
 * Progressive widths for `master` by search ply (distance from root):
 * - Ply 0 (root): Full width (Infinity) so critical blocks/takeovers are never filtered.
 * - Ply 1: 16
 * - Ply 2: 14
 * - Ply 3+: 8
 */
export const MASTER_PROGRESSIVE_WIDTHS = [Infinity, 16, 14, 8, 8, 8] as const;

/**
 * Children searched per node.
 * Kept for registry/spec compatibility; Master uses progressive widths.
 */
export const MINIMAX_WIDTHS: Partial<Record<MinimaxLevel, number>> = { master: 8 };

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  depth: number;
  value: number;
  flag: number;
  bestActionId?: number;
}

function stateKey(state: GameState): string {
  let k = `${state.current}|`;
  for (let i = 0; i < 5; i += 1) {
    const d = state.displays[i];
    k += `${d[0]},${d[1]},${d[2]},${d[3]},${d[4]};`;
  }
  const c = state.center;
  k += `|${state.center_has_token ? 1 : 0}|${c[0]},${c[1]},${c[2]},${c[3]},${c[4]}|`;
  for (let p = 0; p < 2; p += 1) {
    const b = state.players[p];
    k += `${b.staging_colors.join(',')};${b.staging_counts.join(',')};${b.penalty_tiles.length};${b.has_first_token ? 1 : 0}|`;
  }
  return k;
}

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
  private readonly tt = new Map<string, TTEntry>();

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
   * Children sorted by their one-ply value for the side to move,
   * placing the transposition table's best action first if known.
   */
  private ordered(state: GameState, ply = 0, ttActionId?: number): Action[] {
    const mover = state.current;
    const scored = legalActions(state).map(
      (a) => [a.actionId === ttActionId ? Infinity : actionValue(state, a, mover, this.weights), a] as const,
    );
    scored.sort((x, y) => y[0] - x[0]);
    const ordered = scored.map(([, a]) => a);
    let limit = this.width;
    if (this.level === 'master') {
      const w = MASTER_PROGRESSIVE_WIDTHS[ply];
      if (w !== undefined) limit = w;
    }
    return Number.isFinite(limit) ? ordered.slice(0, limit) : ordered;
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
    ply = 1,
  ): number {
    if (now() > this.deadline) throw new SearchCapped();
    this.nodes += 1;

    if (state.draftingDone()) return this.leaf(state, player);
    if (depth === 0) return evaluate(state, player, this.weights);

    const key = stateKey(state);
    const entry = this.tt.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return entry.value;
      if (entry.flag === TT_LOWER && entry.value >= beta) return entry.value;
      if (entry.flag === TT_UPPER && entry.value <= alpha) return entry.value;
    }

    const origAlpha = alpha;
    const maximizing = state.current === player;
    let best = maximizing ? -INF : INF;
    let bestAction: Action | null = null;
    const actions = this.ordered(state, ply, entry?.bestActionId);

    for (const action of actions) {
      const undo = applyAction(state, action);
      let value: number;
      try {
        value = this.search(state, player, depth - 1, alpha, beta, ply + 1);
      } finally {
        undoAction(state, undo);
      }
      if (maximizing) {
        if (value > best) {
          best = value;
          bestAction = action;
        }
        if (best > alpha) alpha = best;
      } else {
        if (value < best) {
          best = value;
          bestAction = action;
        }
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }

    let flag = TT_EXACT;
    if (best <= origAlpha) flag = TT_UPPER;
    else if (best >= beta) flag = TT_LOWER;
    this.tt.set(key, { depth, value: best, flag, bestActionId: bestAction?.actionId });

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
        value = this.search(state, player, depth - 1, alpha, INF, 1);
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
    this.tt.clear();
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
