/**
 * Fails the build when the engine changes without `ENGINE_VERSION` moving.
 *
 * Shared replays store a seed and a list of action ids, and rebuild every board
 * by re-running the engine. A change to how tiles are dealt or how an action
 * resolves therefore makes every replay ever shared decode into a *different*
 * game — silently, and long after the change shipped. `ENGINE_VERSION` is what
 * lets the player refuse those instead of drawing a game nobody played, so it
 * has to move whenever the engine does.
 *
 * The check is a content hash of the engine files, recorded next to the
 * version. When the hash moves and the version does not, this fails and tells
 * you what to do.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files whose behavior a replay depends on. */
const WATCHED = [
  'src/engine/rules.ts',
  'src/engine/game.ts',
  'src/engine/rng.ts',
  'src/engine/state.ts',
  'src/engine/constants.ts',
];

const MANIFEST = join(root, 'src/replay/engine-hash.json');

function currentHash() {
  const hash = createHash('sha256');
  for (const file of WATCHED) {
    hash.update(file);
    hash.update(readFileSync(join(root, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

function currentVersion() {
  const source = readFileSync(join(root, 'src/replay/version.ts'), 'utf8');
  const match = /export const ENGINE_VERSION = (\d+)/.exec(source);
  if (!match) throw new Error('Could not read ENGINE_VERSION from src/replay/version.ts');
  return Number(match[1]);
}

const hash = currentHash();
const version = currentVersion();

let recorded;
try {
  recorded = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {
  recorded = null;
}

if (process.argv.includes('--write') || recorded === null) {
  writeFileSync(MANIFEST, `${JSON.stringify({ version, hash }, null, 2)}\n`);
  console.log(`engine-hash.json written: v${version} ${hash}`);
  process.exit(0);
}

if (recorded.hash === hash) {
  process.exit(0);
}

if (recorded.version === version) {
  console.error(
    [
      '',
      'The engine changed but ENGINE_VERSION did not.',
      '',
      `  watched: ${WATCHED.join(', ')}`,
      `  recorded: v${recorded.version} ${recorded.hash}`,
      `  current:  v${version} ${hash}`,
      '',
      'Replays store a seed and a list of moves, so a change here can make every',
      'replay already shared decode into a different game. Decide which it is:',
      '',
      '  * The change CAN affect the deal or how an action resolves.',
      `    Bump ENGINE_VERSION to ${version + 1} in src/replay/version.ts, then run:`,
      '        node scripts/check-engine-version.mjs --write',
      '    Replays recorded before the change will be refused, which is the point.',
      '',
      '  * The change CANNOT (a comment, a rename, a pure refactor).',
      '    Re-record the hash without bumping the version:',
      '        node scripts/check-engine-version.mjs --write',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

// Version moved with the engine: record the new pairing.
writeFileSync(MANIFEST, `${JSON.stringify({ version, hash }, null, 2)}\n`);
console.log(`engine-hash.json updated: v${version} ${hash}`);
