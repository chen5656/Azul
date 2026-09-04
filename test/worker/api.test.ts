/**
 * Worker endpoints end to end (§19 "Worker"): auth, the BR-011/012/013
 * rejections, best-of-many upsert semantics, tie-break ordering, and
 * `DELETE /api/me`.
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { purgeOldRows } from '../../worker/cron';
import { currentPuzzleId } from '../../worker/daily';
import { MIN_ELAPSED_MS, RATE_LIMIT_PER_HOUR } from '../../worker/scores';
import {
  type TestSession,
  apiRequest,
  call,
  migrate,
  signInAnonymously,
  signUp,
} from './helpers';

const TODAY = currentPuzzleId();

const WIN = {
  puzzle_id: TODAY,
  elapsed_ms: 461_230,
  final_score: 64,
  opponent_score: 51,
  rounds: 5,
  client_version: '1.0.0',
};

async function post(body: unknown, session?: TestSession): Promise<Response> {
  return call(apiRequest('/api/scores', { method: 'POST', body: JSON.stringify(body), session }));
}

beforeEach(async () => {
  await migrate();
});

describe('GET /api/daily', () => {
  it("describes today's puzzle without auth", async () => {
    const response = await call(apiRequest('/api/daily'));
    expect(response.status).toBe(200);
    const body = await response.json<{ puzzle_id: string; seed: number; opponent: string; next_rollover_ms: number }>();
    expect(body.puzzle_id).toBe(TODAY);
    expect(body.opponent).toBe('extreme');
    expect(Number.isInteger(body.seed)).toBe(true);
    expect(body.next_rollover_ms).toBeGreaterThan(Date.now());
  });
});

describe('POST /api/scores', () => {
  it('rejects an unauthenticated post and writes nothing (AC-020)', async () => {
    const response = await post(WIN);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it('rejects a forged session cookie', async () => {
    const response = await call(
      apiRequest('/api/scores', {
        method: 'POST',
        body: JSON.stringify(WIN),
        headers: { cookie: '__Secure-better-auth.session_token=made.up' },
      }),
    );
    expect(response.status).toBe(401);
  });

  it('accepts a win and reports rank 1 on an empty board', async () => {
    const session = await signUp('ada');
    const response = await post(WIN, session);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accepted: true, improved: true, best_elapsed_ms: 461_230, rank: 1, total_entries: 1,
    });
    const row = await env.DB.prepare('SELECT display_name FROM scores').first<{ display_name: string }>();
    expect(row?.display_name).toBe('ada');
  });

  it('accepts a post from an anonymous session', async () => {
    const session = await signInAnonymously();
    const response = await post(WIN, session);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, rank: 1 });
  });

  it("rejects yesterday's puzzle with 409 (AC-021)", async () => {
    const session = await signUp();
    const response = await post({ ...WIN, puzzle_id: '2020-01-01' }, session);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'STALE_PUZZLE' } });
  });

  it('rejects an implausible time and audits the rejection (AC-022)', async () => {
    const session = await signUp();
    const response = await post({ ...WIN, elapsed_ms: 5000 }, session);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'IMPLAUSIBLE_TIME' } });

    const audit = await env.DB.prepare(
      'SELECT accepted, reason FROM submissions_audit ORDER BY id DESC',
    ).first<{ accepted: number; reason: string }>();
    expect(audit).toMatchObject({ accepted: 0, reason: 'IMPLAUSIBLE_TIME' });
  });

  it('rejects an attempt against a retired, unranked level', async () => {
    const session = await signUp();
    const response = await post({ ...WIN, ai_level: 'medium' }, session);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'UNRANKED_LEVEL' } });
  });

  it.each(['master', 'expert'])('accepts an attempt against %s', async (aiLevel) => {
    const session = await signUp();
    const response = await post({ ...WIN, ai_level: aiLevel }, session);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true });
  });

  it('rejects a time above the upper bound', async () => {
    const session = await signUp();
    expect((await post({ ...WIN, elapsed_ms: 7_200_001 }, session)).status).toBe(422);
  });

  it('accepts a submission with a tie or loss (negative score margin)', async () => {
    const session = await signUp();
    const response = await post({ ...WIN, final_score: 40, opponent_score: 45 }, session);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, rank: 1 });
  });

  it('rejects a malformed payload and audits it', async () => {
    const session = await signUp();
    const response = await post({ puzzle_id: 'nope' }, session);
    expect(response.status).toBe(422);
    const audit = await env.DB.prepare('SELECT reason FROM submissions_audit').first<{ reason: string }>();
    expect(audit?.reason).toBe('INVALID_PAYLOAD');
  });

  it('keeps the attempt with better score margin, in one row (AC-018, AC-019)', async () => {
    const session = await signUp();
    await post(WIN, session); // 64 - 51 = 13 diff

    // Smaller diff (10 diff) even if faster elapsed time is not improved
    const smallerDiff = await post({ ...WIN, elapsed_ms: 300_000, final_score: 60, opponent_score: 50 }, session);
    expect(await smallerDiff.json()).toMatchObject({ improved: false, best_elapsed_ms: 461_230 });

    // Larger diff (20 diff) is improved
    const largerDiff = await post({ ...WIN, elapsed_ms: 500_000, final_score: 70, opponent_score: 50 }, session);
    expect(await largerDiff.json()).toMatchObject({ improved: true, best_final_score: 70, best_opponent_score: 50 });

    // Same diff (20 diff) but faster time is improved
    const fasterSameDiff = await post({ ...WIN, elapsed_ms: 400_000, final_score: 70, opponent_score: 50 }, session);
    expect(await fasterSameDiff.json()).toMatchObject({ improved: true, best_elapsed_ms: 400_000 });

    const rows = await env.DB.prepare(
      'SELECT COUNT(*) AS n, MIN(elapsed_ms) AS best, MAX(final_score) AS score, MAX(attempts) AS attempts FROM scores WHERE user_id = ?',
    ).bind(session.userId).first<{ n: number; best: number; score: number; attempts: number }>();
    expect(rows).toMatchObject({ n: 1, best: 400_000, score: 70, attempts: 1 });
  });

  it('tracks attempt counts across multiple attempts including worse games', async () => {
    const session = await signUp();
    // 1st attempt (loss / worse score)
    const first = await post({ ...WIN, attempts: 1, final_score: 40, opponent_score: 50 }, session);
    expect(await first.json()).toMatchObject({ accepted: true, attempts: 1 });

    // 2nd attempt (worse score, not improved, but attempts should increase to 2)
    const second = await post({ ...WIN, attempts: 2, final_score: 35, opponent_score: 50 }, session);
    expect(await second.json()).toMatchObject({ accepted: true, improved: false, attempts: 2 });

    // 3rd attempt (improved score, attempts should be 3)
    const third = await post({ ...WIN, attempts: 3, final_score: 65, opponent_score: 45 }, session);
    expect(await third.json()).toMatchObject({ accepted: true, improved: true, attempts: 3 });

    const row = await env.DB.prepare('SELECT attempts, final_score FROM scores WHERE user_id = ?')
      .bind(session.userId)
      .first<{ attempts: number; final_score: number }>();
    expect(row).toMatchObject({ attempts: 3, final_score: 65 });
  });

  it('rate-limits the 61st submission in an hour (AC-024)', async () => {
    const session = await signUp();
    const now = Date.now();
    // Fill the audit trail directly; the limit counts submissions, accepted or not.
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
      await env.DB.prepare(
        `INSERT INTO submissions_audit (puzzle_id, user_id, elapsed_ms, accepted, reason, created_at)
         VALUES (?, ?, ?, 1, NULL, ?)`,
      ).bind(TODAY, session.userId, MIN_ELAPSED_MS, now - i).run();
    }
    const response = await post(WIN, session);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });
});

describe('GET /api/leaderboard', () => {
  async function seed(rows: [string, string, number, number, number, number][]): Promise<void> {
    for (const [userId, name, elapsed, finalScore, oppScore, createdAt] of rows) {
      await env.DB.prepare(
        `INSERT INTO scores (puzzle_id, user_id, display_name, elapsed_ms, final_score,
                             opponent_score, rounds, client_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 5, '1.0.0', ?, ?)`,
      ).bind(TODAY, userId, name, elapsed, finalScore, oppScore, createdAt, createdAt).run();
    }
  }

  it('returns entries and a null me without auth (AC-025)', async () => {
    await seed([['user_a', 'ada', 461_230, 64, 51, 1000]]);
    const response = await call(apiRequest('/api/leaderboard'));
    const body = await response.json<{ entries: unknown[]; me: unknown; total_entries: number }>();
    expect(body.entries).toHaveLength(1);
    expect(body.me).toBeNull();
    expect(body.total_entries).toBe(1);
  });

  it('orders by score margin descending first, then elapsed time, then created_at', async () => {
    await seed([
      ['user_diff_small', 'small_diff', 200_000, 50, 45, 1000], // diff = +5
      ['user_diff_big', 'big_diff', 500_000, 70, 50, 3000],    // diff = +20
      ['user_late_same_diff', 'late_same', 400_000, 60, 45, 2000], // diff = +15
      ['user_early_same_diff', 'early_same', 400_000, 60, 45, 1000], // diff = +15
    ]);
    const response = await call(apiRequest('/api/leaderboard'));
    const body = await response.json<{ entries: { display_name: string; rank: number }[] }>();
    expect(body.entries.map((e) => e.display_name)).toEqual([
      'big_diff',
      'early_same',
      'late_same',
      'small_diff',
    ]);
    expect(body.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it('reports a true rank outside the top of the board (AC-026)', async () => {
    const rows: [string, string, number, number, number, number][] = [];
    for (let i = 0; i < 111; i += 1) rows.push([`user_${i}`, `p${i}`, 100_000 + i, 80, 50, 1000 + i]);
    const session = await signUp('ada');
    rows.push([session.userId, 'ada', 900_000, 55, 50, 5000]); // diff = +5 vs +30 of others
    await seed(rows);

    const response = await call(apiRequest('/api/leaderboard?limit=100', { session }));
    const body = await response.json<{ entries: unknown[]; me: { rank: number; elapsed_ms: number; final_score: number; opponent_score: number; attempts: number; replay: string | null } }>();
    expect(body.entries).toHaveLength(100);
    expect(body.me).toEqual({ rank: 112, elapsed_ms: 900_000, final_score: 55, opponent_score: 50, attempts: 1, replay: null });
  });

  it('returns an empty board rather than an error (AC-028)', async () => {
    const response = await call(apiRequest('/api/leaderboard'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entries: [], total_entries: 0, me: null });
  });

  it('rejects a malformed puzzle_id', async () => {
    expect((await call(apiRequest('/api/leaderboard?puzzle_id=yesterday'))).status).toBe(422);
  });
});

describe('DELETE /api/me', () => {
  it('removes every row for the user and returns the counts (AC-029)', async () => {
    const session = await signUp();
    await post(WIN, session);

    const response = await call(apiRequest('/api/me', { method: 'DELETE', session }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted_scores: 1, deleted_audit: 1 });

    const scores = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first<{ n: number }>();
    const audit = await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions_audit').first<{ n: number }>();
    expect([scores?.n, audit?.n]).toEqual([0, 0]);
  });

  it('deletes the account itself, sessions and linked providers included', async () => {
    const session = await signUp();
    await post(WIN, session);

    expect((await call(apiRequest('/api/me', { method: 'DELETE', session }))).status).toBe(200);

    // The cascade is the part worth asserting: a `user` row that vanishes while
    // its `session` and `account` rows survive would leave the password hash
    // and the provider tokens behind, and the deletion promise would be false.
    for (const table of ['user', 'session', 'account']) {
      const left = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM "${table}" WHERE ${table === 'user' ? 'id' : '"userId"'} = ?`,
      )
        .bind(session.userId)
        .first<{ n: number }>();
      expect(left?.n, `${table} rows left behind`).toBe(0);
    }

    // And the session cookie is dead, not merely orphaned.
    expect((await call(apiRequest('/api/me/history', { session }))).status).toBe(401);
  });

  it('needs auth', async () => {
    expect((await call(apiRequest('/api/me', { method: 'DELETE' }))).status).toBe(401);
  });
});

describe('retention sweep', () => {
  it('deletes rows older than 90 days and keeps newer ones (BR-014)', async () => {
    const now = Date.now();
    const old = now - 91 * 24 * 3600 * 1000;
    await env.DB.prepare(
      `INSERT INTO scores (puzzle_id, user_id, display_name, elapsed_ms, final_score,
                           opponent_score, rounds, client_version, created_at, updated_at)
       VALUES ('2020-01-01', 'u', 'old', 100000, 1, 0, 5, '1.0.0', ?, ?)`,
    ).bind(old, old).run();
    await env.DB.prepare(
      `INSERT INTO scores (puzzle_id, user_id, display_name, elapsed_ms, final_score,
                           opponent_score, rounds, client_version, created_at, updated_at)
       VALUES (?, 'v', 'new', 100000, 1, 0, 5, '1.0.0', ?, ?)`,
    ).bind(TODAY, now, now).run();

    expect(await purgeOldRows(env.DB, now)).toEqual({ scores: 1, audit: 0 });
    const left = await env.DB.prepare('SELECT display_name FROM scores').first<{ display_name: string }>();
    expect(left?.display_name).toBe('new');
  });
});

describe('routing', () => {
  it('answers a preflight with the allowed origin', async () => {
    const response = await call(apiRequest('/api/scores', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://acgame.win');
  });

  it('404s an unknown endpoint in the standard error shape', async () => {
    const response = await call(apiRequest('/api/nope'));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
