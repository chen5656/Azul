/**
 * Replay verification and `GET /api/me/history`.
 *
 * The verification tests matter more than they look: a replay is the only
 * evidence the Worker has that a posted score came from a game that was
 * actually played, so "a wrong replay is refused" is the property that makes
 * `verified = 1` mean anything at all.
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { currentPuzzleId, seedForPuzzle } from '../../worker/daily';
import { GreedyAgent } from '../../src/ai';
import { QuadroGame } from '../../src/engine';
import { encodeReplay } from '../../src/replay/codec';
import { ENGINE_VERSION } from '../../src/replay/version';
import { apiRequest, call, migrate, signUp } from './helpers';

const TODAY = currentPuzzleId();
const HUMAN_SEAT = 0;

/**
 * A genuine game on today's deal, played by two cheap agents. Greedy keeps this
 * fast enough to run per-test; nothing here depends on the agent's strength.
 */
function playToday() {
  const game = new QuadroGame(seedForPuzzle(TODAY), HUMAN_SEAT);
  const agent = new GreedyAgent(1, 0);
  while (!game.isOver()) game.step(agent.choose(game.state, game.state.current));
  const result = game.result();
  return {
    game,
    replay: encodeReplay({
      engineVersion: ENGINE_VERSION,
      seed: game.seed,
      firstPlayer: game.firstPlayer,
      humanSeat: HUMAN_SEAT,
      aiLevel: 'extreme',
      scores: [result.scores[0], result.scores[1]],
      puzzleId: TODAY,
      actions: game.history.map((a) => a.actionId),
    }),
    submission: {
      puzzle_id: TODAY,
      elapsed_ms: 461_230,
      final_score: result.scores[HUMAN_SEAT],
      opponent_score: result.scores[1 - HUMAN_SEAT],
      rounds: result.rounds,
      ai_level: 'extreme',
      client_version: '1.0.0',
    },
  };
}

beforeEach(async () => {
  await migrate();
});

describe('POST /api/scores with a replay', () => {
  it('accepts a genuine replay and marks the row verified', async () => {
    const { replay, submission } = playToday();
    const session = await signUp();
    const response = await call(
      apiRequest('/api/scores', {
        method: 'POST',
        session,
        body: JSON.stringify({ ...submission, replay }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json<{ verified: boolean }>()).toMatchObject({ verified: true });

    const row = await env.DB.prepare('SELECT replay, verified FROM scores').first<{
      replay: string;
      verified: number;
    }>();
    expect(row?.verified).toBe(1);
    expect(row?.replay).toBe(replay);
  });

  it('refuses a score the replay does not produce', async () => {
    const { replay, submission } = playToday();
    const session = await signUp();
    const response = await call(
      apiRequest('/api/scores', {
        method: 'POST',
        session,
        // The moves are real; the claimed score is not.
        body: JSON.stringify({ ...submission, final_score: submission.final_score + 20, replay }),
      }),
    );

    expect(response.status).toBe(422);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('REPLAY_SCORE_MISMATCH');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('refuses a corrupted replay', async () => {
    const { submission } = playToday();
    const session = await signUp();
    const response = await call(
      apiRequest('/api/scores', {
        method: 'POST',
        session,
        body: JSON.stringify({ ...submission, replay: 'AAAAAAAAAAAA' }),
      }),
    );
    expect(response.status).toBe(422);
  });

  it('still accepts a submission with no replay, unverified', async () => {
    const { submission } = playToday();
    const session = await signUp();
    const response = await call(
      apiRequest('/api/scores', { method: 'POST', session, body: JSON.stringify(submission) }),
    );

    expect(response.status).toBe(200);
    expect(await response.json<{ verified: boolean }>()).toMatchObject({ verified: false });
    const row = await env.DB.prepare('SELECT replay, verified FROM scores').first<{
      replay: string | null;
      verified: number;
    }>();
    expect(row?.replay).toBeNull();
    expect(row?.verified).toBe(0);
  });
});

describe('GET /api/me/history', () => {
  async function seed(userId: string, rows: Array<{ day: string; level: string; score: number }>) {
    for (const row of rows) {
      await env.DB.prepare(
        `INSERT INTO scores (puzzle_id, user_id, display_name, elapsed_ms, final_score,
                             opponent_score, ai_level, rounds, client_version, replay,
                             verified, created_at, updated_at)
         VALUES (?, ?, 'Ada', 100000, ?, 10, ?, 5, '1.0.0', NULL, 0, 1000, 1000)`,
      )
        .bind(row.day, userId, row.score, row.level)
        .run();
    }
  }

  it('requires auth', async () => {
    expect((await call(apiRequest('/api/me/history'))).status).toBe(401);
  });

  it('returns only the caller’s own rows, newest day first', async () => {
    const session = await signUp();
    await seed(session.userId, [
      { day: '2026-01-01', level: 'extreme', score: 40 },
      { day: '2026-01-03', level: 'extreme', score: 55 },
      { day: '2026-01-02', level: 'easy', score: 30 },
    ]);
    await seed('user_someone_else', [{ day: '2026-01-03', level: 'extreme', score: 99 }]);

    const response = await call(apiRequest('/api/me/history', { session }));
    expect(response.status).toBe(200);

    const body = await response.json<{
      entries: Array<{ puzzle_id: string; margin: number; rank: number | null }>;
      next_before: string | null;
    }>();
    expect(body.entries.map((e) => e.puzzle_id)).toEqual([
      '2026-01-03',
      '2026-01-02',
      '2026-01-01',
    ]);
    expect(body.entries[0].margin).toBe(45);
    // The other player scored higher on that day's Extreme board.
    expect(body.entries[0].rank).toBe(2);
    expect(body.next_before).toBeNull();
  });

  it('pages with a cursor', async () => {
    const session = await signUp();
    await seed(
      session.userId,
      ['2026-02-01', '2026-02-02', '2026-02-03'].map((day) => ({
        day,
        level: 'extreme',
        score: 40,
      })),
    );

    const first = await (
      await call(apiRequest('/api/me/history?limit=2', { session }))
    ).json<{ entries: Array<{ puzzle_id: string }>; next_before: string | null }>();
    expect(first.entries.map((e) => e.puzzle_id)).toEqual(['2026-02-03', '2026-02-02']);
    expect(first.next_before).toBe('2026-02-02');

    const second = await (
      await call(apiRequest(`/api/me/history?before=${first.next_before}`, { session }))
    ).json<{ entries: Array<{ puzzle_id: string }>; next_before: string | null }>();
    expect(second.entries.map((e) => e.puzzle_id)).toEqual(['2026-02-01']);
    expect(second.next_before).toBeNull();
  });

  it('rejects a malformed cursor', async () => {
    const session = await signUp();
    expect((await call(apiRequest('/api/me/history?before=nope', { session }))).status).toBe(422);
  });
});
