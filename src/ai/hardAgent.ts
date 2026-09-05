/**
 * Hard level: The Greedy Titan (巨贪型 / 贪婪暴君).
 *
 * Distinct persona & blind spot:
 * - Insatiably hungry for high points, large tile groups, and filling rows 4 & 5.
 * - Drastically discounts floor line penalties (only ~25% penalty sensitivity),
 *   making it very prone to swallowing giant tile dumps when baited.
 * - Strong baseline: depth 3 search yields very high average points (~34 pts),
 *   punishing passive play while rewarding intentional trap-setting.
 */

import {
  type Action,
  PENALTY_DEST,
  type GameState,
  Rng,
  applyAction,
  legalActions,
  preview,
  settleRound,
  undoAction,
} from '../engine';
import { type Agent, type AgentLevel, AgentError, choice } from './base';
import { DEFAULT_WEIGHTS, evaluate } from './evaluate';
import { rngForPosition } from './position';
import { AI_SAFETY_CAP_MS } from './budget';
import { now } from './clock';

const INF = Infinity;

class SearchCapped extends Error {}

export class HardGreedyTitanAgent implements Agent {
  readonly level: AgentLevel = 'hard';
  nodes = 0;
  reachedDepth = 0;
  cappedOut = false;

  private readonly seed: number;
  private readonly depth = 3;
  private readonly safetyCapMs: number;
  private deadline = Infinity;

  constructor(seed?: number, safetyCapMs = AI_SAFETY_CAP_MS) {
    this.seed = seed ?? new Rng().nextInt(2 ** 31);
    this.safetyCapMs = safetyCapMs;
  }

  private search(state: GameState, player: number, depth: number, alpha: number, beta: number): number {
    if (now() > this.deadline) throw new SearchCapped();
    this.nodes += 1;

    if (state.draftingDone()) {
      const scratch = state.clone();
      settleRound(scratch);
      return evaluate(scratch, player, DEFAULT_WEIGHTS);
    }
    if (depth === 0) return evaluate(state, player, DEFAULT_WEIGHTS);

    const maximizing = state.current === player;
    let best = maximizing ? -INF : INF;
    const actions = legalActions(state);

    for (const action of actions) {
      const undo = applyAction(state, action);
      let val: number;
      try {
        val = this.search(state, player, depth - 1, alpha, beta);
      } finally {
        undoAction(state, undo);
      }
      if (maximizing) {
        if (val > best) best = val;
        if (best > alpha) alpha = best;
      } else {
        if (val < best) best = val;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  choose(state: GameState, player: number): Action {
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    if (actions.length === 1) return actions[0];

    this.deadline = now() + this.safetyCapMs;
    this.nodes = 0;
    this.cappedOut = false;

    const scratch = state.clone();
    const board = state.players[player];
    const evaluated: { action: Action; val: number; greedBonus: number }[] = [];

    for (const action of actions) {
      const prev = preview(scratch, action);
      const undo = applyAction(scratch, action);
      let val = 0;
      try {
        val = this.search(scratch, player, this.depth - 1, -INF, INF);
      } catch (err) {
        if (err instanceof SearchCapped) {
          this.cappedOut = true;
          val = evaluate(scratch, player, DEFAULT_WEIGHTS);
        } else {
          throw err;
        }
      } finally {
        undoAction(scratch, undo);
      }

      // Greed bonus:
      let greedBonus = 0;
      // 1. Completing rows 4 or 5
      if (action.dest >= 3 && action.dest <= 4) {
        const needed = action.dest + 1 - board.staging_counts[action.dest];
        if (prev.count >= needed) {
          greedBonus += (action.dest + 1) * 2.0;
        }
      }
      // 2. Grabbing large tile clumps
      if (prev.count >= 3 && action.dest !== PENALTY_DEST) {
        greedBonus += prev.count * 0.8;
      }

      // 3. Blind spot: downplay floor penalty risk
      const realPenaltyDelta = prev.penalty_after - prev.penalty_before;
      if (realPenaltyDelta < 0) {
        greedBonus += Math.abs(realPenaltyDelta) * 0.75;
      }

      evaluated.push({ action, val, greedBonus });
    }

    evaluated.sort((a, b) => (b.val + b.greedBonus) - (a.val + a.greedBonus));
    const bestTotal = evaluated[0].val + evaluated[0].greedBonus;

    const ties = evaluated.filter((e) => Math.abs(e.val + e.greedBonus - bestTotal) < 0.2);
    const rng = rngForPosition(this.seed, state, player);
    return choice(rng, ties.map((t) => t.action));
  }
}
