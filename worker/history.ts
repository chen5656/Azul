/**
 * `GET /api/me/history` — the signed-in player's own attempts.
 *
 * One row per (day, opponent), which is exactly what `scores` already stores:
 * the table keeps a player's best attempt per board, so the history is a read
 * of rows that were always there rather than a new write path.
 *
 * Rank is computed per row against that day's board. That is one COUNT per
 * row, so the page size is deliberately small — a snapshot column would be
 * cheaper, but it would also have to be backfilled for every existing row and
 * kept correct as later players post.
 */

import type { Session } from './auth';
import { json } from './http';
import { AI_LEVELS, rankOf } from './leaderboard';

export const HISTORY_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface HistoryRow {
  puzzle_id: string;
  ai_level: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
  rounds: number;
  replay: string | null;
  verified: number;
  created_at: number;
}

export async function history(
  db: D1Database,
  session: Session,
  options: { limit?: number; before?: string | null } = {},
): Promise<Response> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? HISTORY_PAGE_SIZE) || HISTORY_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const before = options.before ?? null;

  // Keyset pagination on puzzle_id: cheaper than OFFSET and stable when a new
  // day's row is inserted between requests.
  // One extra row is fetched to learn whether another page exists.
  const rows = await db
    .prepare(
      `SELECT puzzle_id, ai_level, elapsed_ms, final_score, opponent_score, rounds,
              replay, verified, created_at
         FROM scores
        WHERE user_id = ?1
          AND (?2 IS NULL OR puzzle_id < ?2)
        ORDER BY puzzle_id DESC, ai_level ASC
        LIMIT ?3`,
    )
    .bind(session.userId, before, limit + 1)
    .all<HistoryRow>();

  const all = rows.results ?? [];
  const page = all.slice(0, limit);

  const entries = await Promise.all(
    page.map(async (row) => ({
      puzzle_id: row.puzzle_id,
      ai_level: row.ai_level,
      elapsed_ms: row.elapsed_ms,
      final_score: row.final_score,
      opponent_score: row.opponent_score,
      margin: row.final_score - row.opponent_score,
      rounds: row.rounds,
      replay: row.replay,
      verified: row.verified === 1,
      played_at: row.created_at,
      rank: (AI_LEVELS as readonly string[]).includes(row.ai_level)
        ? await rankOf(
            db,
            row.puzzle_id,
            row.ai_level as (typeof AI_LEVELS)[number],
            row.final_score - row.opponent_score,
            row.elapsed_ms,
            row.created_at,
          )
        : null,
    })),
  );

  return json({
    entries,
    // Cursor for the next page; absent when this was the last one.
    next_before: all.length > limit ? page[page.length - 1]?.puzzle_id ?? null : null,
  });
}
