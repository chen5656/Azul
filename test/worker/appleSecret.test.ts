/**
 * The Apple client secret the Worker signs for itself.
 *
 * Apple's only feedback on a malformed client secret is `invalid_client`, with
 * no indication of which part was wrong — so the JWT is checked here against a
 * real P-256 key rather than by eye.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import {
  appleClientSecret,
  appleIsConfigured,
  resetAppleClientSecretCache,
} from '../../worker/auth/apple-secret';

/** A throwaway signing key, exported the way Apple exports a .p8. */
async function generateP8(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer,
  );
  let binary = '';
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');

  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

async function verify(jwt: string, publicKey: CryptoKey): Promise<boolean> {
  const [header, payload, signature] = jwt.split('.');
  const raw = atob(signature.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    bytes,
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

const IDENTITY = {
  APPLE_CLIENT_ID: 'win.acgame.web',
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
};

describe('apple client secret', () => {
  beforeEach(() => resetAppleClientSecretCache());

  it('signs a JWT Apple can verify with the matching public key', async () => {
    const { pem, publicKey } = await generateP8();

    const jwt = await appleClientSecret({ ...IDENTITY, APPLE_PRIVATE_KEY: pem });
    expect(jwt).toBeTruthy();

    const [header, payload] = jwt!.split('.');
    expect(decodeSegment(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(decodeSegment(payload)).toMatchObject({
      iss: 'TEAM123456',
      aud: 'https://appleid.apple.com',
      sub: 'win.acgame.web',
    });

    await expect(verify(jwt!, publicKey)).resolves.toBe(true);
  });

  it('stays inside Apple’s six-month ceiling', async () => {
    const { pem } = await generateP8();
    const jwt = await appleClientSecret({ ...IDENTITY, APPLE_PRIVATE_KEY: pem });

    const { iat, exp } = decodeSegment(jwt!.split('.')[1]) as { iat: number; exp: number };
    expect(exp - iat).toBeLessThan(15777000);
    expect(exp - iat).toBeGreaterThan(30 * 24 * 60 * 60);
  });

  it('accepts a .p8 whose newlines were flattened by a shell', async () => {
    const { pem, publicKey } = await generateP8();

    const jwt = await appleClientSecret({
      ...IDENTITY,
      APPLE_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
    });

    await expect(verify(jwt!, publicKey)).resolves.toBe(true);
  });

  it('prefers a statically supplied secret and signs nothing', async () => {
    const { pem } = await generateP8();

    await expect(
      appleClientSecret({ ...IDENTITY, APPLE_PRIVATE_KEY: pem, APPLE_CLIENT_SECRET: 'preminted' }),
    ).resolves.toBe('preminted');
  });

  it('offers no secret, and no button, when the key material is incomplete', async () => {
    const { pem } = await generateP8();
    const partial = { APPLE_CLIENT_ID: 'win.acgame.web', APPLE_PRIVATE_KEY: pem };

    expect(appleIsConfigured(partial)).toBe(false);
    await expect(appleClientSecret(partial)).resolves.toBeUndefined();

    expect(appleIsConfigured({ ...IDENTITY, APPLE_PRIVATE_KEY: pem })).toBe(true);
    expect(appleIsConfigured({ APPLE_CLIENT_ID: 'x', APPLE_CLIENT_SECRET: 'y' })).toBe(true);
  });
});
