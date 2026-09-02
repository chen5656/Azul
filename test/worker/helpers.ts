/**
 * Test rig for the Worker: a real local D1 with the production schema, and
 * sessions minted the way the app mints them.
 *
 * There is no token to forge any more. A test that needs an authenticated
 * caller signs one up through the Worker's own `/api/auth/*` endpoints and
 * reuses the session cookie that comes back — so the auth path under test is
 * the same one production runs, cookie signing and all.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';

// Imported as text: workerd has no filesystem, and this keeps the tests running
// against the very files that are applied to production.
import SCHEMA from '../../worker/schema.sql?raw';
import AUTH_SCHEMA from '../../worker/migrations/004_auth.sql?raw';
import worker from '../../worker/index';

export const ORIGIN = 'https://acgame.win';

/** Applies the production schema to the isolated per-test database. */
export async function migrate(): Promise<void> {
  for (const file of [SCHEMA, AUTH_SCHEMA]) {
    for (const statement of file.split(';')) {
      // The generated auth schema is commented; a comment-only chunk is not SQL.
      const sql = statement
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim();
      if (sql) await env.DB.prepare(sql).run();
    }
  }
}

export async function call(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export interface TestSession {
  /** Ready to send as a `cookie` header. */
  cookie: string;
  userId: string;
}

let seq = 0;

/**
 * Signs a fresh player up with email and password and returns their session.
 * `nickname` is what the leaderboard will show.
 */
export async function signUp(nickname = 'ada'): Promise<TestSession> {
  seq += 1;
  const email = `player${seq}@test.example`;

  const response = await call(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email, password: 'correct-horse-battery', name: nickname, nickname }),
    }),
  );
  if (!response.ok) {
    throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
  }

  const cookie = sessionCookie(response);
  const row = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (!row) throw new Error('sign-up left no user row');

  return { cookie, userId: row.id };
}

/** Signs in anonymously — the tap-to-play path. */
export async function signInAnonymously(): Promise<TestSession> {
  const response = await call(
    new Request(`${ORIGIN}/api/auth/sign-in/anonymous`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: '{}',
    }),
  );
  if (!response.ok) {
    throw new Error(`anonymous sign-in failed: ${response.status} ${await response.text()}`);
  }

  const cookie = sessionCookie(response);
  const row = await env.DB.prepare(
    'SELECT id FROM "user" WHERE "isAnonymous" = 1 ORDER BY rowid DESC',
  ).first<{ id: string }>();
  if (!row) throw new Error('anonymous sign-in left no user row');

  return { cookie, userId: row.id };
}

/** Every `Set-Cookie` on the response, folded into one `Cookie` header value. */
function sessionCookie(response: Response): string {
  const headers = response.headers.getSetCookie?.() ?? [];
  const pairs = headers.map((header) => header.split(';', 1)[0]).filter(Boolean);
  if (pairs.length === 0) throw new Error('no session cookie was set');
  return pairs.join('; ');
}

/** A request against the Worker, optionally carrying a session. */
export function apiRequest(
  path: string,
  init: RequestInit & { session?: TestSession | null } = {},
): Request {
  const { session, ...rest } = init;
  return new Request(`${ORIGIN}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(session ? { cookie: session.cookie } : {}),
      ...rest.headers,
    },
  });
}
