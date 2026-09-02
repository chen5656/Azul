/**
 * Warns that `extreme` trades responsiveness for strength.
 *
 * Every level spends a fixed amount of search work rather than a fixed slice of
 * clock, so a level is the same opponent on every device (see
 * `src/ai/budget.ts`). `extreme` is budgeted for strength, which means a slow
 * device pays for it in waiting rather than in facing a weaker opponent — the
 * right trade for a difficulty label to make, but only if the player is told,
 * because an unexplained multi-second pause reads as the game having hung.
 */

import type { AgentLevel } from '../ai';

/** The levels whose search a slow device will visibly wait for. */
const SLOW_LEVELS: readonly AgentLevel[] = ['extreme'];

export function isSlowLevel(level: AgentLevel): boolean {
  return SLOW_LEVELS.includes(level);
}

export function SlowLevelNote({ level }: { level: AgentLevel }): JSX.Element | null {
  if (!isSlowLevel(level)) return null;
  return (
    <p
      role="note"
      className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-200/90"
    >
      <span className="font-semibold">Extreme thinks hard.</span> It searches far deeper than the
      other levels, and its strength is the same on every device — so a slower machine spends longer
      per turn instead of getting an easier opponent. Expect a noticeable pause on every move.{' '}
      <span className="text-amber-100">Master and below stay responsive everywhere.</span>
    </p>
  );
}
