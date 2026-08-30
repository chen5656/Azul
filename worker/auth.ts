/**
 * Clerk session-JWT verification (§13 "Clerk verification").
 *
 * RS256 against the instance's JWKS, fetched over HTTPS and cached for the
 * isolate's lifetime with a 10-minute revalidation. The cache holds only public
 * keys — no request-scoped state ever lives at module scope.
 */

import { HttpError } from './http';

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksCache {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
  issuer: string;
}

const REVALIDATE_AFTER_MS = 10 * 60 * 1000;

let cache: JwksCache | null = null;

export interface SessionClaims {
  sub: string;
  iss: string;
  exp: number;
  nbf?: number;
  azp?: string;
  [claim: string]: unknown;
}

export interface Session {
  userId: string;
  /** Username, then first name, then a truncated id (A-002). */
  displayName: string;
  claims: SessionClaims;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T;
}

async function loadKeys(issuer: string): Promise<Map<string, CryptoKey>> {
  const fresh = cache && cache.issuer === issuer && Date.now() - cache.fetchedAt < REVALIDATE_AFTER_MS;
  if (fresh) return cache!.keys;

  const response = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/jwks.json`);
  if (!response.ok) {
    if (cache?.issuer === issuer) return cache.keys; // serve the stale keys
    throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Could not reach the identity provider');
  }

  const { keys } = (await response.json()) as { keys: Jwk[] };
  const imported = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (jwk.kty !== 'RSA') continue;
    imported.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    );
  }
  cache = { keys: imported, fetchedAt: Date.now(), issuer };
  return imported;
}

/**
 * Verify a bearer token. Returns null when the header is absent — callers that
 * require auth turn that into a 401, and `/api/leaderboard` simply omits `me`.
 */
export async function verifyRequest(
  request: Request,
  env: { CLERK_ISSUER: string; ALLOWED_ORIGIN: string },
): Promise<Session | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice('Bearer '.length).trim(), env);
}

export async function verifyToken(
  token: string,
  env: { CLERK_ISSUER: string; ALLOWED_ORIGIN: string },
): Promise<Session> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'UNAUTHENTICATED', 'Malformed token');

  const [rawHeader, rawPayload, rawSignature] = parts;
  let header: { alg: string; kid: string };
  let claims: SessionClaims;
  try {
    header = decodeJson(rawHeader);
    claims = decodeJson(rawPayload);
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Malformed token');
  }

  if (header.alg !== 'RS256') {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Unsupported token algorithm');
  }

  const keys = await loadKeys(env.CLERK_ISSUER);
  const key = keys.get(header.kid);
  if (!key) throw new HttpError(401, 'UNAUTHENTICATED', 'Unknown signing key');

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!verified) throw new HttpError(401, 'UNAUTHENTICATED', 'Bad token signature');

  const nowSeconds = Date.now() / 1000;
  const issuerMatches =
    claims.iss?.replace(/\/$/, '') === env.CLERK_ISSUER.replace(/\/$/, '');
  if (!issuerMatches) throw new HttpError(401, 'UNAUTHENTICATED', 'Wrong token issuer');
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Token expired');
  }
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds + 5) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Token not yet valid');
  }
  // `azp` is absent on tokens minted outside a browser context; when present it
  // must be our own origin.
  if (typeof claims.azp === 'string' && claims.azp !== env.ALLOWED_ORIGIN) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Token issued for another origin');
  }
  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Token has no subject');
  }

  return { userId: claims.sub, displayName: displayNameFrom(claims), claims };
}

function displayNameFrom(claims: SessionClaims): string {
  const candidates = [claims.username, claims.name, claims.first_name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 40);
  }
  return `player-${claims.sub.slice(-6)}`;
}

/** Test seam: drops the cached JWKS so a test can install its own. */
export function resetJwksCache(): void {
  cache = null;
}
