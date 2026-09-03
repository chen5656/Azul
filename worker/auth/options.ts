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

import { appleIsConfigured, type AppleKeySecrets } from './apple-secret';

/** Where Apple posts its `form_post` callback from. */
const APPLE_ORIGIN = 'https://appleid.apple.com';

/** Credentials the Worker holds as secrets; absent ones disable that provider. */
export interface AuthSecrets extends AppleKeySecrets {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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
function socialProviders(
  env: AuthSecrets,
  appleClientSecret?: string,
): BetterAuthOptions['socialProviders'] {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  /**
   * Apple's secret is a JWT the Worker signs from the .p8 key (see
   * `apple-secret.ts`), so it arrives here already minted rather than read off
   * `env`. `appleIsConfigured` is the sync answer for `/api/providers`; a
   * missing `appleClientSecret` here means the caller did not mint one, and the
   * button stays off rather than dead-ending after the redirect.
   */
  if (env.APPLE_CLIENT_ID && appleIsConfigured(env) && appleClientSecret) {
    providers.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: appleClientSecret,
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

/**
 * The provider ids the client should render buttons for. Sync on purpose:
 * `/api/providers` answers from configuration alone, never by signing anything.
 */
export function enabledProviders(env: AuthSecrets): string[] {
  const ids = Object.keys(socialProviders(env) ?? {});
  if (appleIsConfigured(env) && !ids.includes('apple')) ids.push('apple');
  return ids;
}

export function authOptions(
  env: AuthSecrets,
  onLink?: LinkAccount,
  appleClientSecret?: string,
): BetterAuthOptions {
  const origin = env.ALLOWED_ORIGIN ?? 'https://acgame.win';

  return {
    appName: 'Quadro',
    baseURL: origin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,

    /**
     * Apple's `form_post` callback is a cross-site POST carrying
     * `Origin: https://appleid.apple.com`, and better-auth validates the origin
     * of *every* non-GET request against this list — so without Apple in it,
     * the callback is rejected with `INVALID_ORIGIN` before it is ever read.
     *
     * The function form is what keeps that narrow. better-auth resolves it per
     * request for the origin-header check only; the static list built at init
     * (called with no request, hence the guard) is what `callbackURL`,
     * `redirectTo` and friends are validated against. So Apple's origin is
     * trusted to *send* us its one callback, and is never a URL this app can be
     * talked into redirecting a player to.
     */
    trustedOrigins: (request?: Request) => {
      if (!request) return [origin];
      const { pathname } = new URL(request.url);
      return pathname.endsWith('/callback/apple') ? [origin, APPLE_ORIGIN] : [origin];
    },

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

    socialProviders: socialProviders(env, appleClientSecret),

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

      /**
       * The one cookie that cannot be `lax`.
       *
       * Apple returns from its consent screen with `response_mode=form_post`:
       * a cross-site POST from `appleid.apple.com` to our callback. A `lax`
       * cookie is withheld on a cross-site POST, and better-auth's callback
       * requires the signed `state` cookie to match the `state` it looks up in
       * the `verification` table — so with `lax` every Apple sign-in fails with
       * `state_security_mismatch`, 100% of the time.
       *
       * Widening only this cookie keeps the session cookie `lax`. CSRF cover is
       * unchanged: `state` is 32 random characters minted per attempt, stored
       * server-side, single-use, and 5 minutes from expiry — the cookie is the
       * second copy of it, not the secret itself. Google and LinkedIn come back
       * as a plain GET redirect and are indifferent to the attribute.
       */
      cookies: {
        state: {
          // `None` is only honoured on a Secure cookie — a browser drops
          // `None` without `Secure` outright, which would break sign-in over
          // plain http in dev. There is no cross-site POST to survive there,
          // so dev keeps `lax`.
          attributes: origin.startsWith('https://')
            ? { sameSite: 'none' as const, secure: true }
            : { sameSite: 'lax' as const },
        },
      },
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
