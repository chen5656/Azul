/**
 * Level name -> agent.
 *
 * Six difficulty levels over three algorithms (see `LEVELS`); the learned agent
 * under `backend/zero/` is out of scope here (BUILD-SPEC D-004), so unlike the
 * Python registry there is no weights gating and no learned entry.
 */

import { type Agent, type AgentLevel, LEVELS } from './base';
import { EASY_EPSILON, GreedyAgent } from './greedyAgent';
import { MctsAgent } from './mctsAgent';
import { MINIMAX_DEPTHS, MINIMAX_WIDTHS, MinimaxAgent } from './minimaxAgent';

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
    case 'easy':
      return new GreedyAgent(seed, EASY_EPSILON);
    case 'medium':
    case 'hard':
    case 'expert':
    case 'master':
      return new MinimaxAgent(
        seed,
        MINIMAX_DEPTHS[level],
        timeBudget,
        undefined,
        level,
        MINIMAX_WIDTHS[level] ?? Infinity,
      );
    case 'extreme':
      return new MctsAgent({ seed, timeBudget });
    default: {
      const exhaustive: never = level;
      throw new Error(`unknown ai level: ${String(exhaustive)}`);
    }
  }
}

/** Human-facing labels for the level pickers (English only, D-019). */
export const LEVEL_LABELS: Record<AgentLevel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  master: 'Master',
  extreme: 'Extreme',
};
