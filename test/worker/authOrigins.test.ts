/**
 * Which origins may talk to `/api/auth/*`.
 *
 * better-auth validates the `Origin` header of every non-GET request against
 * `trustedOrigins`, and Apple's callback is a cross-site POST — so this list
 * being wrong shows up as either a broken Apple sign-in or an open redirect,
 * and never as a test failure elsewhere. Asserted on the config directly:
 * better-auth skips the origin check outright under NODE_ENV=test, so driving
 * a request through the handler here would prove nothing.
 */

import { describe, expect, it } from 'vitest';

import { authOptions } from '../../worker/auth/options';

const ORIGIN = 'https://acgame.win';

/** The resolver as better-auth calls it: with a request, or with none at init. */
function resolve(url?: string): string[] {
  const trusted = authOptions({ ALLOWED_ORIGIN: ORIGIN }).trustedOrigins;
  if (typeof trusted !== 'function') throw new Error('expected the per-request form');
  return trusted(url ? new Request(url, { method: 'POST' }) : (undefined as never)) as string[];
}

describe('trusted origins', () => {
  it('trusts Apple on the callback it posts to', () => {
    expect(resolve(`${ORIGIN}/api/auth/callback/apple`)).toEqual([
      ORIGIN,
      'https://appleid.apple.com',
    ]);
  });

  it('trusts nobody but the app everywhere else', () => {
    expect(resolve(`${ORIGIN}/api/auth/callback/google`)).toEqual([ORIGIN]);
    expect(resolve(`${ORIGIN}/api/auth/sign-in/social`)).toEqual([ORIGIN]);
    expect(resolve(`${ORIGIN}/api/auth/delete-user`)).toEqual([ORIGIN]);
  });

  it('keeps Apple out of the list that redirect targets are checked against', () => {
    // Resolved with no request at init — this is what `callbackURL`,
    // `redirectTo` and `newUserCallbackURL` are validated against.
    expect(resolve()).toEqual([ORIGIN]);
  });

  it('does not match a path that merely mentions the callback', () => {
    expect(resolve(`${ORIGIN}/api/auth/callback/apple/../evil`)).toEqual([ORIGIN]);
    expect(resolve(`${ORIGIN}/api/auth/callback/applesauce`)).toEqual([ORIGIN]);
  });
});
