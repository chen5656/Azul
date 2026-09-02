/**
 * The one better-auth configuration, shared by the Worker and by the schema
 * generator in `scripts/gen-auth-schema.mjs`.
 *
 * Keeping it in a single factory is what makes the generated SQL and the
 * running instance provably the same shape: a provider or an extra user field
 * added here shows up in the next migration instead of drifting silently.
 */

import type { BetterAuthOptions } from 'better-auth';
import { anonymous } from 'better-auth/plugins/anonymous';

/** Credentials the Worker holds as secrets; absent ones disable that provider. */
export interface AuthSecrets {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  ALLOWED_ORIGIN?: string;
}

/** Called when an anonymous player signs in for real; see `linkAnonymousScores`. */
export type LinkAccount = (anonymousUserId: string, newUserId: string) => Promise<void>;

/**
 * `socialProviders` only lists the ones actually configured. A half-configured
 * provider would render a button that dead-ends in a 500 after the redirect —
 * far worse than a button that is simply not there.
 */
function socialProviders(env: AuthSecrets): BetterAuthOptions['socialProviders'] {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    providers.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      // Only set for the native app flow; harmless and required by the types
      // to be a string, so fall back to the services id.
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    };
  }

  if (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    providers.linkedin = {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
    };
  }

  return providers;
}

/** The provider ids the client should render buttons for. */
export function enabledProviders(env: AuthSecrets): string[] {
  return Object.keys(socialProviders(env) ?? {});
}

export function authOptions(env: AuthSecrets, onLink?: LinkAccount): BetterAuthOptions {
  const origin = env.ALLOWED_ORIGIN ?? 'https://acgame.win';

  return {
    appName: 'Quadro',
    baseURL: origin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],

    /**
     * The leaderboard shows a nickname, never a legal name. Google, Apple and
     * LinkedIn all hand back a real name in `name`; we keep that column because
     * better-auth writes it, but nothing user-facing reads it — `nickname` is
     * what the board renders, and the player picks it.
     */
    user: {
      additionalFields: {
        nickname: { type: 'string', required: false, input: true },
      },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // No transactional mail is wired up yet, so requiring verification would
      // lock every email signup out permanently.
      requireEmailVerification: false,
    },

    socialProviders: socialProviders(env),

    /**
     * One person, one row. Signing in with Google and later with Apple on the
     * same address lands on the same account instead of splitting a player's
     * history in two. All three providers verify their emails, so they are
     * trusted; `allowDifferentEmails` covers Apple's private relay addresses.
     */
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'apple', 'linkedin'],
        allowDifferentEmails: true,
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      /**
       * Deliberately off. The cookie cache stores a signed copy of the session
       * in a second cookie and answers `getSession` from it without touching
       * the database — which means a deleted account keeps working until that
       * copy expires, and nothing the server does can revoke it in the
       * meantime. Account deletion has to take effect on the next request, so
       * every authenticated call reads the session row. That is one indexed D1
       * lookup on endpoints that already query D1.
       */
      cookieCache: { enabled: false },
    },

    advanced: {
      // Pages and the Worker share `acgame.win`, so the session cookie is a
      // plain same-origin cookie; no cross-subdomain handling needed.
      useSecureCookies: origin.startsWith('https://'),
      defaultCookieAttributes: { sameSite: 'lax' },
    },

    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await onLink?.(anonymousUser.user.id, newUser.user.id);
        },
      }),
    ],
  };
}
