/**
 * Which opponents the Daily offers and how a choice is written to the URL.
 *
 * The level lives in `?ai=`, not in state, so anything that can navigate can
 * change it — the board's opponent chip and the header's ⚙ menu both do.
 */

import type { AgentLevel } from '../ai';

/** Strongest first: the board's headline opponent leads the row. */
export const DAILY_LEVELS: readonly AgentLevel[] = [
  'extreme',
  'master',
  'expert',
  'hard',
  'medium',
  'easy',
] as const;

/** The boards a Daily time can be posted to. */
export const RANKED_LEVELS: readonly AgentLevel[] = ['extreme', 'master', 'expert'];

/** What a player faces before they pick anything: the gentlest opponent. */
export const DEFAULT_LEVEL: AgentLevel = 'easy';

export const isRankedLevel = (level: AgentLevel) => RANKED_LEVELS.includes(level);

export const LEVEL_DESCRIPTIONS: Record<AgentLevel, string> = {
  extreme: 'Deep Monte Carlo Tree Search (MCTS)',
  master: 'Minimax search with advanced heuristic evaluation',
  expert: 'Lookahead minimax tree evaluation',
  hard: 'Aggressive heuristic scoring & line planning',
  medium: 'Standard heuristic pattern matching',
  easy: 'Greedy local tile selections',
};

/**
 * The Daily URL for `level`. `DEFAULT_LEVEL` is the absence of the parameter,
 * so it is the one value that must be dropped rather than written.
 */
export function dailyHrefFor(level: AgentLevel, search = window.location.search): string {
  const params = new URLSearchParams(search);
  params.delete('level');
  if (level === DEFAULT_LEVEL) params.delete('ai');
  else params.set('ai', level);
  const qs = params.toString();
  return qs ? `/daily?${qs}` : '/daily';
}
