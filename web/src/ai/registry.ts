/**
 * Level name -> agent.
 *
 * Exactly the four classic levels. The learned agent under `backend/zero/` is
 * out of scope here (BUILD-SPEC D-004), so unlike the Python registry there is
 * no weights gating and no fifth entry.
 */

import { type Agent, type AgentLevel, LEVELS } from './base';
import { GreedyAgent } from './greedyAgent';
import { MctsAgent } from './mctsAgent';
import { MinimaxAgent } from './minimaxAgent';
import { RandomAgent } from './randomAgent';

/** The Daily's opponent budget, in seconds (D-013, BR-004). */
export const DAILY_TIME_BUDGET = 0.45;

export function availableLevels(): readonly AgentLevel[] {
  return LEVELS;
}

/**
 * `timeBudget` (seconds) applies to the searching levels only. It defaults to
 * the Daily's 450ms; Practice may lower it, the Daily never does (AC-012).
 */
export function makeAgent(
  level: AgentLevel,
  seed?: number,
  timeBudget: number = DAILY_TIME_BUDGET,
): Agent {
  switch (level) {
    case 'random':
      return new RandomAgent(seed);
    case 'greedy':
      return new GreedyAgent(seed);
    case 'minimax':
      return new MinimaxAgent(seed, 4, timeBudget);
    case 'mcts':
      return new MctsAgent({ seed, timeBudget });
    default: {
      const exhaustive: never = level;
      throw new Error(`unknown ai level: ${String(exhaustive)}`);
    }
  }
}

/** Human-facing labels for the Practice level picker (English only, D-019). */
export const LEVEL_LABELS: Record<AgentLevel, string> = {
  random: 'Random',
  greedy: 'Greedy',
  minimax: 'Minimax',
  mcts: 'Monte Carlo',
};
