/** Agent protocol shared by every AI level. */

import type { Action, GameState, Rng } from '../engine';

export class AgentError extends Error {}

export interface Agent {
  readonly level: AgentLevel;
  /**
   * Pick one legal action for `player` in `state`.
   * Implementations must not leave `state` mutated: clone it, or use undo.
   */
  choose(state: GameState, player: number): Action;
}

/** The four classic levels. The learned agent is out of scope here (D-004). */
export const LEVELS = ['random', 'greedy', 'minimax', 'mcts'] as const;
export type AgentLevel = (typeof LEVELS)[number];

/** `random.Random.choice`: uniform pick from a non-empty sequence. */
export function choice<T>(rng: Rng, items: T[]): T {
  return items[rng.nextInt(items.length)];
}

/**
 * `random.Random.sample`: k distinct items, via a partial Fisher-Yates shuffle
 * over a copy. Order is unspecified, which is all the rollout policy needs.
 */
export function sample<T>(rng: Rng, items: T[], k: number): T[] {
  const pool = items.slice();
  for (let i = 0; i < k; i += 1) {
    const j = i + rng.nextInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}
