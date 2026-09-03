/**
 * Which opponent Practice faces and how a choice is written to the URL.
 *
 * Mirrors `src/daily/levels.ts`: the level lives in `?ai=`, not in component
 * state, so anything that can navigate — the setup grid or the header's ⚙ menu
 * — can change it.
 */

import { LEVELS, type AgentLevel } from '../ai';
import { storage } from '../storage';

const isLevel = (value: string | null): value is AgentLevel =>
  value !== null && (LEVELS as readonly string[]).includes(value);

/**
 * Which opponent a Practice URL means. The URL wins; failing that, the one this
 * device last played; failing that, Easy for a first-time player.
 */
export function resolvePracticeLevel(search: string): AgentLevel {
  const ai = new URLSearchParams(search).get('ai');
  if (isLevel(ai)) return ai;
  const remembered = storage.practiceLevel();
  return isLevel(remembered) ? remembered : 'easy';
}

export function practiceHrefFor(level: AgentLevel, search = window.location.search): string {
  const params = new URLSearchParams(search);
  params.set('ai', level);
  return `/practice?${params.toString()}`;
}
