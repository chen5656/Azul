/**
 * Making an agent's answer a function of the position, not of its history.
 *
 * Every level uses randomness somewhere — `easy` for its epsilon, the
 * alpha-beta levels to break ties between equally-valued moves, `extreme` to
 * draw a determinization per simulation. Drawing that from one running stream
 * makes an agent's reply depend on how many times it has been asked anything at
 * all, so the same position in the same seeded game can get different answers
 * depending on what happened earlier in the session: a restart, an undo, a
 * speculative search that was discarded, a rebuilt worker.
 *
 * Reseeding per call from a hash of the position instead makes `choose` pure —
 * the same seed and the same position always produce the same move, on any
 * device, however many times it is asked. That is what lets a player compare
 * two attempts at one Daily and know the opponent played identically.
 */

import { type GameState, Rng, fnv1a32 } from '../engine';

/**
 * The RNG an agent should use for this question.
 *
 * The state is serialized with its RNG included, so two positions that differ
 * only in what the bag will deal next are still distinct questions.
 */
export function rngForPosition(seed: number, state: GameState, player: number): Rng {
  const key = `${seed}:${player}:${JSON.stringify(state.toDict(true))}`;
  return new Rng(fnv1a32(key));
}

/**
 * The opponent seed for one attempt.
 *
 * Purity above is per *seed*: with a seed fixed for all time — a Daily's date,
 * a Practice deal — every level answers a given position identically forever,
 * so a player reopening the same board and repeating their moves faces a
 * verbatim recording of the last game. Drawing the seed fresh at the start of
 * each attempt keeps the property that matters (one attempt is reproducible
 * from end to end, whatever the device does, however the worker is rebuilt)
 * and drops the one that does not (attempt N+1 is a copy of attempt N).
 *
 * Replays are unaffected: `src/replay/codec.ts` records both players' actions
 * rather than recomputing the agent's, so a shared game replays move for move
 * without knowing which seed produced it.
 */
export function randomAgentSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
