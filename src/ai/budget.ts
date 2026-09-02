/**
 * What the AI is allowed to spend on a move.
 *
 * The levels used to be defined by a wall-clock budget: search until 450ms are
 * up, then answer with whatever you have. That makes the opponent's strength a
 * property of the player's hardware — the same Daily is a harder game on a
 * desktop than on a three-year-old phone, and a slow device quietly gets a
 * weaker opponent instead of a slower one.
 *
 * So strength is defined in units of work instead: a search depth for the
 * alpha-beta levels, a simulation count for `extreme`. Every device plays the
 * same opponent; a slow one only waits longer. The clock survives solely as
 * `AI_SAFETY_CAP_MS`, a stop-loss that ordinary hardware never reaches.
 */

/**
 * Hard ceiling on a single search, in milliseconds.
 *
 * Every level is sized to finish its work well inside this: on the bench
 * machine the worst single move measured is `master`'s ~2s outlier, with the
 * other levels under 800ms, so a device several times slower still plays every
 * level in full — and unlike a budget, being slow costs time, not strength. A
 * search that does trip the cap returns its best answer so far and sets
 * `cappedOut` — degraded, but never a hung tab.
 */
export const AI_SAFETY_CAP_MS = 30000;

/**
 * The work `extreme` may spend on a move, in engine operations.
 *
 * Counting simulations is the obvious knob and the wrong one. A simulation
 * plays out to the end of the game, so what one costs depends entirely on where
 * the position sits: at the start of a round, with full displays and the whole
 * game still ahead, one costs ~18 engine operations, against ~8 in the endgame.
 * A fixed count therefore makes the time per move swing by more than a factor
 * of two, and a count affordable at a round boundary starves the endgame — the
 * phase this level exists to win.
 *
 * Budgeting the *work* instead — one unit per action applied or round settled
 * inside the search — normalizes that automatically. Expensive positions get
 * fewer, cheaper simulations get more, and the level costs about the same
 * everywhere. It also lands the simulations where they are worth most: the
 * endgame, where playouts are short and the search actually converges, is
 * exactly where the same work buys thousands of them instead of dozens. That is
 * the squeeze the level exists to apply.
 *
 * The schedule climbs by round on top of that, deliberately spending more real
 * time as the game closes, where a precise read decides it.
 *
 * Calibrated from manual games played with the proven 450ms agent on 2026-09-02.
 * That agent actually spent 82k-109k operations in round 1, 96k-118k in round
 * 2, 100k-129k in round 3, 104k-153k in round 4, and 144k-429k in round 5.
 * The earlier 4.5k-18k schedule therefore removed roughly 88-96% of its search
 * and was not strength-equivalent. These conservative per-round ceilings retain
 * at least the measured work of the strong version while making it independent
 * of processor speed.
 */
export const EXTREME_STEPS_BY_ROUND = [110000, 120000, 130000, 155000, 430000] as const;

/** The schedule's last entry stands for every round beyond it. */
export function extremeSteps(round: number): number {
  const table = EXTREME_STEPS_BY_ROUND;
  const index = Math.min(Math.max(round, 1), table.length) - 1;
  return table[index];
}
