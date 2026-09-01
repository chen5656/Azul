/**
 * Build-time guard: the Clerk instance the client signs in against must be the
 * one the Worker verifies tokens from.
 *
 * A publishable key is `pk_<env>_` + base64 of `<frontend-api-host>$`, so the
 * pairing is checkable without any network call or secret. When the two drift
 * apart the app looks signed in and every authenticated /api call 401s with
 * "Wrong token issuer" — a failure that only shows up after deploy. Fail the
 * build instead.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`\nClerk config check failed:\n  ${message}\n`);
  process.exit(1);
}

/** The publishable key for a production build: .env.production, then .env. */
function publishableKey() {
  for (const file of ['.env.production', '.env']) {
    let text;
    try {
      text = readFileSync(resolve(root, file), 'utf8');
    } catch {
      continue;
    }
    const match = text.match(/^\s*VITE_CLERK_PUBLISHABLE_KEY\s*=\s*(.+)$/m);
    const value = match?.[1].trim().replace(/^['"]|['"]$/g, '');
    if (value) return { value, file };
  }
  return null;
}

/** CLERK_ISSUER out of wrangler.jsonc, comments and all. */
function workerIssuer() {
  const text = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8').replace(
    /^\s*\/\/.*$/gm,
    '',
  );
  const match = text.match(/"CLERK_ISSUER"\s*:\s*"([^"]+)"/);
  if (!match) fail('wrangler.jsonc has no CLERK_ISSUER var.');
  return match[1];
}

const key = publishableKey();
if (!key) {
  fail(
    'No VITE_CLERK_PUBLISHABLE_KEY found in .env.production or .env.\n' +
      '  The build would ship with sign-in disabled.',
  );
}

const encoded = key.value.replace(/^pk_(test|live)_/, '');
if (encoded === key.value) fail(`${key.file}: not a Clerk publishable key: ${key.value}`);

const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
const issuerHost = new URL(workerIssuer()).host;

if (host !== issuerHost) {
  fail(
    `${key.file} signs in against "${host}", but the Worker (wrangler.jsonc\n` +
      `  CLERK_ISSUER) only accepts tokens from "${issuerHost}".\n` +
      '  Sign-in would appear to work and every authenticated /api call would 401.',
  );
}

console.log(`Clerk config OK: ${host} (from ${key.file}) matches CLERK_ISSUER.`);
