/**
 * Session identity for `/api/*`.
 *
 * better-auth owns the whole sign-in surface at `/api/auth/*` and issues an
 * HttpOnly session cookie. Handlers here never see a token: they ask for the
 * session and get a user id and a display name, or null.
 */

import { betterAuth } from 'better-auth';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';

import { HttpError } from '../http';
import { appleClientSecret } from './apple-secret';
import { authOptions, enabledProviders } from './options';

export { enabledProviders };

function buildAuth(env: Env, appleSecret?: string) {
  return betterAuth({
    ...authOptions(
      env,
      (anonymousId, userId) => linkAnonymousScores(env.DB, anonymousId, userId),
      appleSecret,
    ),
    // D1 speaks SQLite; Kysely is how better-auth talks to it.
    database: {
      db: new Kysely({ dialect: new D1Dialect({ database: env.DB }) }),
      type: 'sqlite' as const,
    },
  });
}

/** The concrete instance type, so the plugin-augmented `api` stays typed. */
export type Auth = ReturnType<typeof buildAuth>;

/**
 * D1 bindings are per-request objects, but within one isolate the same binding
 * comes back each time, so the instance is cached against it. Nothing
 * request-scoped is captured.
 *
 * The Apple secret is minted, not read, and it eventually expires — so the
 * instance is keyed by the secret it was built with. In practice that mints
 * once per isolate; on the day the JWT ages out, the next request rebuilds
 * around a fresh one instead of serving a dead credential.
 */
const instances = new WeakMap<D1Database, { auth: Auth; appleSecret?: string }>();

export async function getAuth(env: Env): Promise<Auth> {
  const appleSecret = await appleClientSecret(env);

  const cached = instances.get(env.DB);
  if (cached && cached.appleSecret === appleSecret) return cached.auth;

  const auth = buildAuth(env, appleSecret);
  instances.set(env.DB, { auth, appleSecret });
  return auth;
}

export interface Session {
  userId: string;
  /** The nickname the player chose, then their provider name, then a stable id. */
  displayName: string;
  /** Avatar URL, or null when they never set one. */
  imageUrl: string | null;
  isAnonymous: boolean;
}

export function displayNameFor(user: {
  id: string;
  nickname?: string | null;
  name?: string | null;
}): string {
  return user.nickname || user.name || `player-${user.id.slice(-6)}`;
}

/**
 * Reads the session cookie. Returns null when there is none — callers that
 * require auth turn that into a 401, and `/api/leaderboard` simply omits `me`.
 */
export async function verifyRequest(request: Request, env: Env): Promise<Session | null> {
  const auth = await getAuth(env);
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;

  const user = result.user as {
    id: string;
    name?: string | null;
    image?: string | null;
    nickname?: string | null;
    isAnonymous?: boolean | null;
  };

  return {
    userId: user.id,
    displayName: displayNameFor(user),
    imageUrl: user.image ?? null,
    isAnonymous: Boolean(user.isAnonymous),
  };
}

/** Like `verifyRequest`, but 401s instead of returning null. */
export async function requireSession(request: Request, env: Env): Promise<Session> {
  const session = await verifyRequest(request, env);
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in first');
  return session;
}

/**
 * Carries an anonymous player's posted times onto the account they just signed
 * in with (better-auth deletes the anonymous user right after this runs).
 *
 * `scores` is unique per (puzzle, user, agent), so a day the player already
 * posted from the real account keeps that row: `UPDATE OR IGNORE` leaves the
 * conflicting anonymous row behind, and the delete drops it.
 */
export async function linkAnonymousScores(
  db: D1Database,
  anonymousUserId: string,
  userId: string,
): Promise<void> {
  await db.batch([
    db
      .prepare('UPDATE OR IGNORE scores SET user_id = ?, updated_at = ? WHERE user_id = ?')
      .bind(userId, Date.now(), anonymousUserId),
    db.prepare('DELETE FROM scores WHERE user_id = ?').bind(anonymousUserId),
    db
      .prepare('UPDATE submissions_audit SET user_id = ? WHERE user_id = ?')
      .bind(userId, anonymousUserId),
  ]);
}
