/**
 * Test rig for the Worker: a real local D1 with the production schema, and a
 * self-signed RS256 token served through a stubbed JWKS endpoint.
 */

import { env } from 'cloudflare:test';
import { vi } from 'vitest';

// Imported as text: workerd has no filesystem, and this keeps the tests running
// against the very file that is applied to production.
import SCHEMA from '../../worker/schema.sql?raw';
import { resetJwksCache } from '../../worker/auth';

export const ISSUER = 'https://clerk.test.example';
export const ORIGIN = 'https://acgame.win';

/** Applies `worker/schema.sql` to the isolated per-test database. */
export async function migrate(): Promise<void> {
  for (const statement of SCHEMA.split(';')) {
    const sql = statement.trim();
    if (sql) await env.DB.prepare(sql).run();
  }
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

let keyPair: CryptoKeyPair | null = null;

async function keys(): Promise<CryptoKeyPair> {
  keyPair ??= (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return keyPair;
}

/** Serves our public key at the issuer's JWKS URL and nothing else. */
export async function stubJwks(): Promise<void> {
  const { publicKey } = await keys();
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  resetJwksCache();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${ISSUER}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
}

export interface TokenOptions {
  sub?: string;
  username?: string;
  expiresInSeconds?: number;
  issuer?: string;
  azp?: string | null;
  notBeforeSeconds?: number;
}

export async function makeToken(options: TokenOptions = {}): Promise<string> {
  const { privateKey } = await keys();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    sub: options.sub ?? 'user_ada',
    iss: options.issuer ?? ISSUER,
    exp: nowSeconds + (options.expiresInSeconds ?? 300),
    iat: nowSeconds,
  };
  if (options.username !== undefined) claims.username = options.username;
  if (options.azp !== null) claims.azp = options.azp ?? ORIGIN;
  if (options.notBeforeSeconds !== undefined) claims.nbf = nowSeconds + options.notBeforeSeconds;

  const signingInput = `${encodeJson({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

/** A request against the Worker, optionally authenticated. */
export function apiRequest(
  path: string,
  init: RequestInit & { token?: string } = {},
): Request {
  const { token, ...rest } = init;
  return new Request(`https://acgame.win${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
}
