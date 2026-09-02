/** Agent protocol shared by every AI level. */

import type { Action, GameState, Rng } from '../engine';

export class AgentError extends Error {}

export interface Agent {
  readonly level: AgentLevel;
  /** Search telemetry from the last move, when the algorithm exposes it. */
  readonly simulations?: number;
  readonly steps?: number;
  /**
   * Set by the searching agents when the last `choose` hit the safety cap and
   * had to answer with less work than the level calls for. Always false on a
   * device fast enough to play the level as designed.
   */
  readonly cappedOut?: boolean;
  /**
   * Pick one legal action for `player` in `state`.
   * Implementations must not leave `state` mutated: clone it, or use undo.
   */
  choose(state: GameState, player: number): Action;
}

/**
 * The six difficulty levels, weakest first. The learned agent is out of scope
 * here (D-004).
 *
 *   easy    ε-greedy — one-ply, and half its moves are thrown away
 *   medium  alpha-beta, depth 2 — the first level with an opponent model
 *   hard    alpha-beta, depth 3
 *   expert  alpha-beta, depth 4
 *   master  alpha-beta, depth 5, narrowed to the 8 best-ordered moves per node
 *   extreme open-loop UCT within the move budget
 */
export const LEVELS = ['easy', 'medium', 'hard', 'expert', 'master', 'extreme'] as const;
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
