/**
 * The replay compatibility version.
 *
 * A replay stores only a seed and a list of action ids: the board states are
 * rebuilt by re-running the engine. Any change to how the engine deals tiles or
 * resolves an action therefore silently invalidates every replay ever shared.
 *
 * BUMP THIS whenever `engine/rules.ts`, `engine/game.ts` or `engine/rng.ts`
 * changes in a way that could alter the state produced by a given
 * (seed, actions) pair. A replay carrying a different version is refused rather
 * than played back wrong — see `decodeReplay`.
 *
 * `scripts/check-engine-version.mjs` fails the build when those files move
 * without this constant moving with them.
 */
export const ENGINE_VERSION = 1;
