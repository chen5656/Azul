/** Level 1 — one-ply search over `evaluate`. Fast, and the rollout policy for MCTS. */

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
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';

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

export class GreedyAgent implements Agent {
  readonly level = 'greedy' as const;
  private readonly rng: Rng;

  constructor(
    seed?: number,
    private readonly epsilon = 0,
    private readonly weights: Weights = DEFAULT_WEIGHTS,
  ) {
    this.rng = new Rng(seed);
  }

  choose(state: GameState, player: number): Action {
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    if (this.epsilon && this.rng.next() < this.epsilon) return choice(this.rng, actions);

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
    return best.length > 1 ? choice(this.rng, best) : best[0];
  }
}
