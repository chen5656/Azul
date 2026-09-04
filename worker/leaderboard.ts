/**
 * `GET /api/leaderboard` — today's global board, top 100.
 *
 * One board per opponent agent (they are not comparable, so they are never
 * mixed): `?ai=extreme|master|expert|hard|medium|easy`, defaulting to the
 * strongest opponent.
 * Ordered by score margin (final_score - opponent_score) DESC, elapsed_ms ASC,
 * with ties broken on earlier created_at (FR-038, AC-027).
 */

import type { Session } from './auth';
import { json } from './http';

export const AI_LEVELS = ['extreme', 'master', 'expert', 'hard', 'medium', 'easy'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];
export const DEFAULT_AI_LEVEL: AiLevel = 'extreme';

/**
 * The levels whose attempts are ranked, strongest first.
 *
 * The three weakest are still playable on the Daily, but a board per level
 * split the day's field six ways and compared attempts that were never
 * comparable. Rows already posted against the weaker levels are left in place
 * — the read path still serves them — but nothing new is written there.
 */
export const RANKED_AI_LEVELS = ['extreme', 'master', 'expert'] as const;

export function isRankedAiLevel(value: AiLevel): boolean {
  return (RANKED_AI_LEVELS as readonly string[]).includes(value);
}

export function isAiLevel(value: unknown): value is AiLevel {
  return typeof value === 'string' && (AI_LEVELS as readonly string[]).includes(value);
}

export interface LeaderboardRow {
  display_name: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
  attempts: number;
  replay: string | null;
}

export async function leaderboard(
  db: D1Database,
  puzzleId: string,
  limit: number,
  session: Session | null,
  aiLevel: AiLevel = DEFAULT_AI_LEVEL,
): Promise<Response> {
  const clamped = Math.min(Math.max(Math.trunc(limit) || 100, 1), 100);

  const [top, total, mine] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT display_name, elapsed_ms, final_score, opponent_score, attempts, replay
           FROM scores
          WHERE puzzle_id = ? AND ai_level = ?
          ORDER BY (final_score - opponent_score) DESC, elapsed_ms ASC, created_at ASC
          LIMIT ?`,
      )
      .bind(puzzleId, aiLevel, clamped),
    db
      .prepare('SELECT COUNT(*) AS n FROM scores WHERE puzzle_id = ? AND ai_level = ?')
      .bind(puzzleId, aiLevel),
    db
      .prepare(
        'SELECT elapsed_ms, final_score, opponent_score, attempts, replay, created_at FROM scores WHERE puzzle_id = ? AND ai_level = ? AND user_id = ?',
      )
      .bind(puzzleId, aiLevel, session?.userId ?? ''),
  ]);

  const entries = (top.results as unknown as LeaderboardRow[]).map((row, index) => ({
    rank: index + 1,
    ...row,
    attempts: row.attempts ?? 1,
    replay: row.replay ?? null,
  }));

  let me: { rank: number; elapsed_ms: number; final_score: number; opponent_score: number; attempts: number; replay: string | null } | null = null;
  const own = (mine.results as unknown as { elapsed_ms: number; final_score: number; opponent_score: number; attempts: number; replay: string | null; created_at: number }[])[0];
  if (session && own) {
    const diff = own.final_score - own.opponent_score;
    me = {
      rank: await rankOf(db, puzzleId, aiLevel, diff, own.elapsed_ms, own.created_at),
      elapsed_ms: own.elapsed_ms,
      final_score: own.final_score,
      opponent_score: own.opponent_score,
      attempts: own.attempts ?? 1,
      replay: own.replay ?? null,
    };
  }

  return json({
    puzzle_id: puzzleId,
    ai_level: aiLevel,
    entries,
    total_entries: Number((total.results as unknown as { n: number }[])[0]?.n ?? 0),
    me,
  });
}

/** True rank under the board's ordering, even far outside the top 100 (FR-035). */
export async function rankOf(
  db: D1Database,
  puzzleId: string,
  aiLevel: AiLevel,
  diff: number,
  elapsedMs: number,
  createdAt: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS ahead
         FROM scores
        WHERE puzzle_id = ?
          AND ai_level = ?
          AND (
            (final_score - opponent_score) > ?
            OR ((final_score - opponent_score) = ? AND elapsed_ms < ?)
            OR ((final_score - opponent_score) = ? AND elapsed_ms = ? AND created_at < ?)
          )`,
    )
    .bind(puzzleId, aiLevel, diff, diff, elapsedMs, diff, elapsedMs, createdAt)
    .first<{ ahead: number }>();
  return Number(row?.ahead ?? 0) + 1;
}
