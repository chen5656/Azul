/**
 * `GET /api/leaderboard` — today's global board, ascending, top 100.
 *
 * Ties break on the earlier `created_at` (FR-038, AC-027), which is exactly the
 * order the `idx_scores_board` index stores, so the query is a range scan.
 */

import type { Session } from './auth';
import { json } from './http';

export interface LeaderboardRow {
  display_name: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
}

export async function leaderboard(
  db: D1Database,
  puzzleId: string,
  limit: number,
  session: Session | null,
): Promise<Response> {
  const clamped = Math.min(Math.max(Math.trunc(limit) || 100, 1), 100);

  const [top, total, mine] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT display_name, elapsed_ms, final_score, opponent_score
           FROM scores
          WHERE puzzle_id = ?
          ORDER BY elapsed_ms ASC, created_at ASC
          LIMIT ?`,
      )
      .bind(puzzleId, clamped),
    db.prepare('SELECT COUNT(*) AS n FROM scores WHERE puzzle_id = ?').bind(puzzleId),
    db
      .prepare('SELECT elapsed_ms, created_at FROM scores WHERE puzzle_id = ? AND user_id = ?')
      .bind(puzzleId, session?.userId ?? ''),
  ]);

  const entries = (top.results as unknown as LeaderboardRow[]).map((row, index) => ({
    rank: index + 1,
    ...row,
  }));

  let me: { rank: number; elapsed_ms: number } | null = null;
  const own = (mine.results as unknown as { elapsed_ms: number; created_at: number }[])[0];
  if (session && own) {
    me = { rank: await rankOf(db, puzzleId, own.elapsed_ms, own.created_at), elapsed_ms: own.elapsed_ms };
  }

  return json({
    puzzle_id: puzzleId,
    entries,
    total_entries: Number((total.results as unknown as { n: number }[])[0]?.n ?? 0),
    me,
  });
}

/** True rank under the board's ordering, even far outside the top 100 (FR-035). */
export async function rankOf(
  db: D1Database,
  puzzleId: string,
  elapsedMs: number,
  createdAt: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS ahead
         FROM scores
        WHERE puzzle_id = ?
          AND (elapsed_ms < ? OR (elapsed_ms = ? AND created_at < ?))`,
    )
    .bind(puzzleId, elapsedMs, elapsedMs, createdAt)
    .first<{ ahead: number }>();
  return Number(row?.ahead ?? 0) + 1;
}
