/**
 * Prints an Apple client secret JWT for the manual path.
 *
 *   node scripts/gen-apple-secret.mjs AuthKey_ABC1234567.p8
 *
 * The Worker normally signs this for itself from `APPLE_PRIVATE_KEY` and never
 * needs a stored secret — see `worker/auth/apple-secret.ts`. This is here for
 * the cases where holding the .p8 in the Worker is not what you want: another
 * environment, a one-off, or debugging a JWT Apple is rejecting.
 *
 * Whatever this prints expires; `APPLE_PRIVATE_KEY` does not. Prefer the key.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [keyPath] = process.argv.slice(2);

const TEAM_ID = process.env.APPLE_TEAM_ID;
const CLIENT_ID = process.env.APPLE_CLIENT_ID;
// Apple names the file AuthKey_<KEYID>.p8, so the id is recoverable from it.
const KEY_ID = process.env.APPLE_KEY_ID ?? basename(keyPath ?? '').match(/AuthKey_(\w+)\.p8/)?.[1];

if (!keyPath || !TEAM_ID || !CLIENT_ID || !KEY_ID) {
  console.error(
    'Usage: APPLE_TEAM_ID=... APPLE_CLIENT_ID=... [APPLE_KEY_ID=...] \\\n' +
      '         node scripts/gen-apple-secret.mjs <AuthKey_XXXXXXXXXX.p8>\n\n' +
      '  APPLE_TEAM_ID   10-character Team ID from developer.apple.com\n' +
      '  APPLE_CLIENT_ID the Services ID (e.g. win.acgame.web), not the App ID\n' +
      '  APPLE_KEY_ID    defaults to the id in the .p8 filename',
  );
  process.exit(1);
}

/** Apple caps this at six months and rejects anything longer outright. */
const LIFETIME_SECONDS = 120 * 24 * 60 * 60;

const issuedAt = Math.floor(Date.now() / 1000);
const expiresAt = issuedAt + LIFETIME_SECONDS;

const header = { alg: 'ES256', kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: issuedAt,
  exp: expiresAt,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

const signer = createSign('SHA256');
signer.update(signingInput);
// `ieee-p1363` is the raw r‖s encoding JWS wants; node's default is DER, which
// Apple rejects with a bare invalid_client and no hint as to why.
const signature = signer.sign(
  { key: readFileSync(keyPath, 'utf8'), dsaEncoding: 'ieee-p1363' },
  'base64url',
);

console.error(`# expires ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}`);
console.log(`${signingInput}.${signature}`);

function b64url(text) {
  return Buffer.from(text).toString('base64url');
}
