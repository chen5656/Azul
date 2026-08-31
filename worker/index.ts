/**
 * `/api/*` router for the Quadro Daily (§13).
 *
 * Four endpoints and a nightly cron. Every handler returns a structured error
 * rather than throwing past the runtime, so a bug never becomes an opaque 1101.
 */

import { verifyRequest } from './auth';
import { purgeOldRows } from './cron';
import { currentPuzzleId, isPuzzleId, nextRolloverMs, seedForPuzzle } from './daily';
import { HttpError, corsHeaders, fail, json } from './http';
import { AI_LEVELS, DEFAULT_AI_LEVEL, isAiLevel, leaderboard } from './leaderboard';
import { deleteMe, submitScore } from './scores';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const response = await route(request, env);
      for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    } catch (err) {
      if (err instanceof HttpError) {
        const response = err.toResponse();
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }
      console.error(
        JSON.stringify({ level: 'error', message: 'unhandled', error: String(err) }),
      );
      return fail(500, 'INTERNAL', 'Something went wrong');
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeOldRows(env.DB).then((deleted) => {
        console.log(JSON.stringify({ level: 'info', message: 'retention sweep', ...deleted }));
      }),
    );
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if ((path === '/api/daily' || path === '/quadro/api/daily') && request.method === 'GET') {
    const puzzleId = currentPuzzleId();
    return json({
      puzzle_id: puzzleId,
      seed: seedForPuzzle(puzzleId),
      opponent: 'extreme',
      next_rollover_ms: nextRolloverMs(),
    });
  }

  if ((path === '/api/leaderboard' || path === '/quadro/api/leaderboard') && request.method === 'GET') {
    const requested = url.searchParams.get('puzzle_id');
    if (requested !== null && !isPuzzleId(requested)) {
      throw new HttpError(422, 'INVALID_PAYLOAD', 'puzzle_id must be YYYY-MM-DD');
    }
    // Auth is optional here: the board reads without it, and `me` is simply
    // absent (FR-036, AC-025).
    const ai = url.searchParams.get('ai');
    if (ai !== null && !isAiLevel(ai)) {
      throw new HttpError(422, 'INVALID_PAYLOAD', `ai must be one of ${AI_LEVELS.join(', ')}`);
    }
    const session = await verifyRequest(request, env).catch(() => null);
    return leaderboard(
      env.DB,
      requested ?? currentPuzzleId(),
      Number(url.searchParams.get('limit') ?? 100),
      session,
      ai ?? DEFAULT_AI_LEVEL,
    );
  }

  if ((path === '/api/scores' || path === '/quadro/api/scores') && request.method === 'POST') {
    const session = await verifyRequest(request, env);
    if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to post a time');
    const body = await request.json().catch(() => null);
    return submitScore(env.DB, session, body);
  }

  if ((path === '/api/me' || path === '/quadro/api/me') && request.method === 'DELETE') {
    const session = await verifyRequest(request, env);
    if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in first');
    return deleteMe(env.DB, session);
  }

  return fail(404, 'NOT_FOUND', 'No such endpoint');
}
