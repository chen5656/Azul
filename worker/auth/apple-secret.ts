/**
 * Apple's client secret, minted in the Worker instead of stored.
 *
 * Every other provider hands out a client secret that is just a string and
 * lives forever. Apple's is an ES256 JWT signed with a .p8 key, and Apple caps
 * its lifetime at six months — so a stored `APPLE_CLIENT_SECRET` is a secret
 * that silently rots, and the failure mode is every Apple sign-in breaking on
 * some morning nobody has a calendar entry for.
 *
 * The .p8 key itself does not expire. Holding that and signing a fresh JWT in
 * the isolate turns a recurring rotation chore into no chore at all: there is
 * nothing to renew, no rotation job to notice has stopped running, and no
 * Cloudflare API token stored in the Worker so that a cron could rewrite its
 * own secrets.
 *
 * `scripts/gen-apple-secret.mjs` still exists for the manual path — set
 * `APPLE_CLIENT_SECRET` and it is used verbatim, ignoring everything here.
 */

/** Apple's own ceiling is six months; well inside it, and re-minted per isolate. */
const LIFETIME_MS = 120 * 24 * 60 * 60 * 1000;

/** Re-mint this long before expiry rather than handing out a nearly dead token. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

/** The key material the Worker needs to sign for itself. */
export interface AppleKeySecrets {
  /** The Services ID, e.g. `win.acgame.web`. Becomes the JWT's `sub`. */
  APPLE_CLIENT_ID?: string;
  /** A ready-made JWT. When set, nothing here runs. */
  APPLE_CLIENT_SECRET?: string;
  /** Contents of the .p8 file from "Sign in with Apple" key, PEM and all. */
  APPLE_PRIVATE_KEY?: string;
  /** The 10-character Team ID. Becomes the JWT's `iss`. */
  APPLE_TEAM_ID?: string;
  /** The 10-character Key ID of the .p8. Becomes the JWT header's `kid`. */
  APPLE_KEY_ID?: string;
}

/**
 * Whether Apple can be offered at all — a static secret, or enough key material
 * to sign one. Sync, because `/api/providers` decides which buttons to render
 * and must not do crypto to answer.
 */
export function appleIsConfigured(env: AppleKeySecrets): boolean {
  if (!env.APPLE_CLIENT_ID) return false;
  if (env.APPLE_CLIENT_SECRET) return true;
  return Boolean(env.APPLE_PRIVATE_KEY && env.APPLE_TEAM_ID && env.APPLE_KEY_ID);
}

let cached: { token: string; expiresAt: number } | null = null;

/**
 * The `clientSecret` to hand better-auth, or undefined when Apple is not
 * configured. Cached in the isolate: signing is ~1ms, but there is no reason to
 * do it on every sign-in.
 */
export async function appleClientSecret(env: AppleKeySecrets): Promise<string | undefined> {
  if (env.APPLE_CLIENT_SECRET) return env.APPLE_CLIENT_SECRET;

  const { APPLE_CLIENT_ID, APPLE_PRIVATE_KEY, APPLE_TEAM_ID, APPLE_KEY_ID } = env;
  if (!APPLE_CLIENT_ID || !APPLE_PRIVATE_KEY || !APPLE_TEAM_ID || !APPLE_KEY_ID) return undefined;

  const now = Date.now();
  if (cached && cached.expiresAt - now > REFRESH_MARGIN_MS) return cached.token;

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = Math.floor((now + LIFETIME_MS) / 1000);

  const token = await signES256(
    { alg: 'ES256', kid: APPLE_KEY_ID },
    {
      iss: APPLE_TEAM_ID,
      iat: issuedAt,
      exp: expiresAt,
      aud: 'https://appleid.apple.com',
      sub: APPLE_CLIENT_ID,
    },
    APPLE_PRIVATE_KEY,
  );

  cached = { token, expiresAt: expiresAt * 1000 };
  return token;
}

/** Only for tests: drops the isolate-level cache. */
export function resetAppleClientSecretCache(): void {
  cached = null;
}

async function signES256(
  header: Record<string, string>,
  payload: Record<string, string | number>,
  pem: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8FromPem(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  // WebCrypto's ECDSA output is already the raw r‖s pair JWS wants — no DER
  // unwrapping, which is the step this would otherwise get wrong.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64urlBytes(new Uint8Array(signature))}`;
}

/**
 * Strips the PEM armour to the DER bytes. Accepts the .p8 exactly as Apple
 * hands it over, including the case where it arrived through a shell and the
 * newlines became literal `\n`.
 */
function pkcs8FromPem(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64url(text: string): string {
  return base64urlBytes(new TextEncoder().encode(text));
}

function base64urlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
