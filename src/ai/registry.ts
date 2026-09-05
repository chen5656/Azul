/**
 * Level name -> agent.
 *
 * Six difficulty levels over three algorithms (see `LEVELS`); the learned agent
 * under `backend/zero/` is out of scope here (BUILD-SPEC D-004), so unlike the
 * Python registry there is no weights gating and no learned entry.
 */

import { type Agent, type AgentLevel, LEVELS } from './base';
import { AI_SAFETY_CAP_MS } from './budget';
import { ExpertRuleAgent } from './expertAgent';
import { EASY_EPSILON, GreedyAgent } from './greedyAgent';
import { MctsAgent } from './mctsAgent';
import { MINIMAX_DEPTHS, MINIMAX_WIDTHS, MinimaxAgent } from './minimaxAgent';

/**
 * Overrides for how much work a level is allowed to do.
 *
 * Every level has a fixed, device-independent budget by default (see
 * `./budget`), which is what makes a level mean the same thing on a phone and
 * on a desktop. These exist for the bench and for tests that want a level to
 * answer instantly; the Daily and Practice both take the defaults (AC-012).
 */
export interface AgentBudget {
  /** `extreme` only: a flat simulation count, replacing the work budget. */
  simulations?: number;
  /** `extreme` calibration only: wall-clock search budget in seconds. */
  timeBudget?: number;
  /** `extreme` only: multiplies the work budget, keeping its by-round shape. */
  stepScale?: number;
  /** Stop-loss for a single search, in milliseconds. */
  safetyCapMs?: number;
}

export function availableLevels(): readonly AgentLevel[] {
  return LEVELS;
}

export function makeAgent(
  level: AgentLevel,
  seed?: number,
  budget: AgentBudget = {},
): Agent {
  switch (level) {
    case 'easy':
      return new GreedyAgent(seed, EASY_EPSILON);
    case 'medium':
    case 'hard':
    case 'master':
      return new MinimaxAgent(
        seed,
        MINIMAX_DEPTHS[level],
        budget.safetyCapMs ?? AI_SAFETY_CAP_MS,
        undefined,
        level,
        MINIMAX_WIDTHS[level] ?? Infinity,
      );
    case 'expert':
      return new ExpertRuleAgent(seed, budget.safetyCapMs);
    case 'extreme':
      return new MctsAgent({
        seed,
        timeBudget: budget.timeBudget,
        maxSimulations: budget.simulations,
        stepScale: budget.stepScale,
        safetyCapMs: budget.safetyCapMs ?? AI_SAFETY_CAP_MS,
      });
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
