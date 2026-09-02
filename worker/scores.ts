/**
 * `POST /api/scores` — the only write path (BR-010).
 *
 * The Worker authenticates, applies the two sanity rules (BR-011, BR-012),
 * rate-limits (BR-013), and stores.
 *
 * D-015's "trust the client" posture holds only for submissions with no
 * replay attached. When one is attached the Worker *does* re-simulate: it
 * re-runs the recorded moves through the engine and refuses the submission
 * unless they produce the posted score. See `worker/replay.ts`.
 */

import type { Session } from './auth';
import { currentPuzzleId, isPuzzleId, seedForPuzzle } from './daily';
import { HttpError, json } from './http';
import { DEFAULT_AI_LEVEL, RANKED_AI_LEVEL, type AiLevel, isAiLevel, rankOf } from './leaderboard';
import { MAX_REPLAY_CHARS, checkReplay } from './replay';

/** BR-011: a five-round game against a 450ms agent cannot be won in 20 seconds. */
export const MIN_ELAPSED_MS = 20_000;
export const MAX_ELAPSED_MS = 7_200_000;

/** BR-013: per-user submissions allowed in a rolling hour. */
export const RATE_LIMIT_PER_HOUR = 60;

export interface SubmissionPayload {
  puzzle_id: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
  rounds: number;
  ai_level: AiLevel;
  client_version: string;
  /**
   * The base64url replay code (`src/replay/codec.ts`). Optional: clients from
   * before replays existed do not send it. When present it is re-run here and
   * the submission is refused if the moves do not produce the posted score.
   */
  replay?: string;
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Validates shape only; the plausibility rules are applied by the caller. */
function parsePayload(body: unknown): SubmissionPayload {
  const p = body as Partial<SubmissionPayload> | null;
  // `ai_level` is optional for older clients, which only ever played Monte Carlo.
  const level = p?.ai_level === undefined ? DEFAULT_AI_LEVEL : p.ai_level;
  const valid =
    p !== null &&
    typeof p === 'object' &&
    isPuzzleId(p.puzzle_id) &&
    isInteger(p.elapsed_ms, 0, Number.MAX_SAFE_INTEGER) &&
    isInteger(p.final_score, -10_000, 10_000) &&
    isInteger(p.opponent_score, -10_000, 10_000) &&
    isInteger(p.rounds, 1, 150) &&
    isAiLevel(level) &&
    typeof p.client_version === 'string' &&
    p.client_version.length <= 32 &&
    (p.replay === undefined ||
      (typeof p.replay === 'string' && p.replay.length <= MAX_REPLAY_CHARS));
  if (!valid) throw new HttpError(422, 'INVALID_PAYLOAD', 'Malformed submission');
  return { ...(p as SubmissionPayload), ai_level: level as AiLevel };
}

async function audit(
  db: D1Database,
  row: {
    puzzle_id: string;
    user_id: string;
    elapsed_ms: number;
    accepted: boolean;
    reason: string | null;
    created_at: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO submissions_audit (puzzle_id, user_id, elapsed_ms, accepted, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.puzzle_id,
      row.user_id,
      row.elapsed_ms,
      row.accepted ? 1 : 0,
      row.reason,
      row.created_at,
    )
    .run();
}

export async function submitScore(
  db: D1Database,
  session: Session,
  body: unknown,
  now = Date.now(),
): Promise<Response> {
  // Parsed first, so an unparseable body cannot be attributed to a puzzle or a
  // time in the audit trail.
  let payload: SubmissionPayload;
  try {
    payload = parsePayload(body);
  } catch (err) {
    await audit(db, {
      puzzle_id: 'unknown', user_id: session.userId, elapsed_ms: 0,
      accepted: false, reason: 'INVALID_PAYLOAD', created_at: now,
    });
    throw err;
  }

  const reject = async (status: number, code: string, message: string): Promise<never> => {
    await audit(db, {
      puzzle_id: payload.puzzle_id, user_id: session.userId, elapsed_ms: payload.elapsed_ms,
      accepted: false, reason: code, created_at: now,
    });
    throw new HttpError(status, code, message);
  };

  const recent = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM submissions_audit WHERE user_id = ? AND created_at > ?',
    )
    .bind(session.userId, now - 3_600_000)
    .first<{ n: number }>();
  if (Number(recent?.n ?? 0) >= RATE_LIMIT_PER_HOUR) {
    await reject(429, 'RATE_LIMITED', 'Too many submissions in the last hour');
  }

  if (payload.puzzle_id !== currentPuzzleId(new Date(now))) {
    await reject(409, 'STALE_PUZZLE', 'That puzzle is no longer the current one');
  }
  if (payload.ai_level !== RANKED_AI_LEVEL) {
    await reject(422, 'UNRANKED_LEVEL', 'Only the strongest opponent is ranked');
  }
  if (payload.elapsed_ms < MIN_ELAPSED_MS || payload.elapsed_ms > MAX_ELAPSED_MS) {
    await reject(422, 'IMPLAUSIBLE_TIME', 'That time is not plausible');
  }

  // A replay is the strongest evidence the Worker can get, so a wrong one is
  // fatal to the submission rather than merely unverified.
  let verified = false;
  if (payload.replay !== undefined) {
    const check = checkReplay(payload.replay, {
      puzzleId: payload.puzzle_id,
      aiLevel: payload.ai_level,
      seed: seedForPuzzle(payload.puzzle_id),
      finalScore: payload.final_score,
      opponentScore: payload.opponent_score,
      rounds: payload.rounds,
    });
    if (!check.ok) {
      await reject(422, check.reason ?? 'REPLAY_INVALID', check.message ?? 'Replay does not match');
    }
    verified = true;
  }

  const existing = await db
    .prepare(
      'SELECT elapsed_ms, final_score, opponent_score, created_at FROM scores WHERE puzzle_id = ? AND user_id = ? AND ai_level = ?',
    )
    .bind(payload.puzzle_id, session.userId, payload.ai_level)
    .first<{ elapsed_ms: number; final_score: number; opponent_score: number; created_at: number }>();

  let improved: boolean;
  let bestElapsedMs: number;
  let bestFinalScore: number;
  let bestOpponentScore: number;
  let createdAt: number;

  const payloadDiff = payload.final_score - payload.opponent_score;

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO scores (puzzle_id, user_id, display_name, elapsed_ms, final_score,
                             opponent_score, ai_level, rounds, client_version, replay,
                             verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        payload.puzzle_id, session.userId, session.displayName, payload.elapsed_ms,
        payload.final_score, payload.opponent_score, payload.ai_level, payload.rounds,
        payload.client_version, payload.replay ?? null, verified ? 1 : 0, now, now,
      )
      .run();
    improved = true;
    bestElapsedMs = payload.elapsed_ms;
    bestFinalScore = payload.final_score;
    bestOpponentScore = payload.opponent_score;
    createdAt = now;
  } else {
    const existingDiff = existing.final_score - existing.opponent_score;
    const isBetter =
      payloadDiff > existingDiff ||
      (payloadDiff === existingDiff && payload.elapsed_ms < existing.elapsed_ms);

    if (isBetter) {
      await db
        .prepare(
          `UPDATE scores
              SET display_name = ?, elapsed_ms = ?, final_score = ?, opponent_score = ?,
                  rounds = ?, client_version = ?, replay = ?, verified = ?, updated_at = ?
            WHERE puzzle_id = ? AND user_id = ? AND ai_level = ?`,
        )
        .bind(
          session.displayName, payload.elapsed_ms, payload.final_score, payload.opponent_score,
          payload.rounds, payload.client_version, payload.replay ?? null, verified ? 1 : 0,
          now, payload.puzzle_id, session.userId, payload.ai_level,
        )
        .run();
      improved = true;
      bestElapsedMs = payload.elapsed_ms;
      bestFinalScore = payload.final_score;
      bestOpponentScore = payload.opponent_score;
      createdAt = existing.created_at;
    } else {
      improved = false;
      bestElapsedMs = existing.elapsed_ms;
      bestFinalScore = existing.final_score;
      bestOpponentScore = existing.opponent_score;
      createdAt = existing.created_at;
    }
  }

  await audit(db, {
    puzzle_id: payload.puzzle_id, user_id: session.userId, elapsed_ms: payload.elapsed_ms,
    accepted: true, reason: null, created_at: now,
  });

  const total = await db
    .prepare('SELECT COUNT(*) AS n FROM scores WHERE puzzle_id = ? AND ai_level = ?')
    .bind(payload.puzzle_id, payload.ai_level)
    .first<{ n: number }>();

  const bestDiff = bestFinalScore - bestOpponentScore;

  return json({
    accepted: true,
    improved,
    verified,
    best_elapsed_ms: bestElapsedMs,
    best_final_score: bestFinalScore,
    best_opponent_score: bestOpponentScore,
    ai_level: payload.ai_level,
    rank: await rankOf(db, payload.puzzle_id, payload.ai_level, bestDiff, bestElapsedMs, createdAt),
    total_entries: Number(total?.n ?? 0),
  });
}

/**
 * `DELETE /api/me` — the account-deletion path (§12.2). Required, not optional.
 *
 * This deletes the account itself, not just its scores: the `user` row goes,
 * and `session` and `account` cascade off it, so the linked providers, the
 * stored provider tokens and the password hash go with it. Anything short of
 * that would make the privacy policy's deletion promise untrue.
 */
export async function deleteMe(db: D1Database, session: Session): Promise<Response> {
  const scores = await db.prepare('DELETE FROM scores WHERE user_id = ?').bind(session.userId).run();
  const audits = await db
    .prepare('DELETE FROM submissions_audit WHERE user_id = ?')
    .bind(session.userId)
    .run();
  await db.prepare('DELETE FROM "user" WHERE id = ?').bind(session.userId).run();
  return json({
    deleted_scores: scores.meta.changes ?? 0,
    deleted_audit: audits.meta.changes ?? 0,
  });
}
