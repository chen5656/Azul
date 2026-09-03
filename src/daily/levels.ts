/**
 * Which opponents the Daily offers and how a choice is written to the URL.
 *
 * The level lives in `?ai=`, not in state, so anything that can navigate can
 * change it — the board's opponent chip and the header's ⚙ menu both do.
 */

import { LEVELS, type AgentLevel } from '../ai';
import { storage } from '../storage';

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
 * The Daily URL for `level`. Every level is written out, including the default:
 * an absent `?ai=` means "has not chosen", which is what lets a returning player
 * be handed the opponent they picked last time instead of Easy.
 */
const isLevel = (value: string | null): value is AgentLevel =>
  value !== null && (LEVELS as readonly string[]).includes(value);

/**
 * Which opponent a Daily URL means. The URL wins; failing that, the one this
 * device last played; failing that, `DEFAULT_LEVEL` for a first-time player.
 */
export function resolveDailyLevel(search: string): AgentLevel {
  const params = new URLSearchParams(search);
  const ai = params.get('ai') ?? params.get('level');
  if (isLevel(ai)) return ai;

  const remembered = storage.dailyLevel();
  if (isLevel(remembered)) return remembered;

  // Note this is *not* `RANKED_LEVEL`: a Daily played on the default difficulty
  // is not posted to the board, and the panel says so.
  return DEFAULT_LEVEL;
}

export function dailyHrefFor(level: AgentLevel, search = window.location.search): string {
  const params = new URLSearchParams(search);
  params.delete('level');
  params.set('ai', level);
  return `/daily?${params.toString()}`;
}
