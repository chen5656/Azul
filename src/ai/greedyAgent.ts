/**
 * One-ply search over `evaluate`. Fast, and the rollout policy for MCTS.
 *
 * Only `easy` plays it as a level, and only with an exploration rate; played
 * straight it is a shade too strong for the bottom rung. It stays the ordering
 * heuristic for alpha-beta and the rollout policy for MCTS.
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
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';
import { rngForPosition } from './position';

/**
 * Value of `state` after `action`, settling the round if the action ends it.
 *
 * `state` is restored before returning, so callers may pass their live state.
 *
 * Settling matters: without it the last draft of a round looks identical to a
 * mid-round one, and the agent cannot see the penalties it is about to eat.
 */
export function actionValue(
  state: GameState,
  action: Action,
  player: number,
  w: Weights = DEFAULT_WEIGHTS,
): number {
  const undo = applyAction(state, action);
  try {
    if (state.draftingDone()) {
      // Settling is not undoable, so the round-end case pays for a clone.
      const scratch = state.clone();
      settleRound(scratch);
      return evaluate(scratch, player, w);
    }
    return evaluate(state, player, w);
  } finally {
    undoAction(state, undo);
  }
}

/** How often `easy` abandons the greedy pick for a uniform random legal move. */
export const EASY_EPSILON = 0.5;

export class GreedyAgent implements Agent {
  readonly level: AgentLevel;
  /** Base seed; the RNG itself is derived per position (see `./position`). */
  private readonly seed: number;

  constructor(
    seed?: number,
    private readonly epsilon = 0,
    private readonly weights: Weights = DEFAULT_WEIGHTS,
    level: AgentLevel = 'easy',
  ) {
    this.seed = seed ?? new Rng().nextInt(2 ** 31);
    this.level = level;
  }

  choose(state: GameState, player: number): Action {
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');

    // Same seed, same position, same move — always, and whatever else this
    // agent has been asked before now.
    const rng = rngForPosition(this.seed, state, player);
    if (this.epsilon && rng.next() < this.epsilon) return choice(rng, actions);

    let best: Action[] = [];
    let bestValue = -Infinity;
    for (const action of actions) {
      const value = actionValue(state, action, player, this.weights);
      if (value > bestValue) {
        bestValue = value;
        best = [action];
      } else if (value === bestValue) {
        best.push(action);
      }
    }
    return best.length > 1 ? choice(rng, best) : best[0];
  }
}
