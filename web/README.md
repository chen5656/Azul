# Quadro — browser client

The v1.0.0 browser client: the whole game runs locally in TypeScript, with
**Practice** (offline, unranked, any level, any seed) and the **Daily
Challenge** (one deal per New York day against the Monte Carlo agent, timed,
with a global fastest-win leaderboard).

Built to
[docs/working-backwards/web-ts-daily-challenge/BUILD-SPEC.md](../docs/working-backwards/web-ts-daily-challenge/BUILD-SPEC.md).

## Layout

```
src/engine/    port of backend/engine — no dependencies, no DOM, no network
src/ai/        random, greedy, minimax, mcts + the shared evaluation
src/daily/     puzzle id, seed derivation, the day's deal
src/workers/   the AI search worker
worker/        the Cloudflare Worker: /api/*, D1, Clerk verification
test/          parity vectors, fuzz, engine/agent/UI/worker tests
```

`../backend/` stays as the reference implementation. It is not on the runtime
path; it generates the parity vectors this port is held to.

## Development

```bash
npm install
npm run dev          # vite, http://localhost:5173
npm test             # node tests + worker tests
npm run typecheck    # app and worker
npm run build
```

### Parity vectors

The TypeScript engine must reproduce the Python engine's state transitions
exactly. Regenerate the fixtures after any change to `backend/engine/`:

```bash
cd ../backend && ./.venv/bin/python -m scripts.export_vectors
```

That writes `test/vectors/`, which `test/parity.test.ts` replays step by step.
The vectors carry explicit states and actions, so they do not depend on either
engine's PRNG — the two deliberately differ (BUILD-SPEC A-003).

### Agent strength

Not in CI: a full run takes over an hour.

```bash
npm run bench                                    # 120 games per pair
npm run bench -- --games 20 --budget 0.1         # quick smoke check
```

Results append to [docs/ts_ai_benchmarks.md](docs/ts_ai_benchmarks.md).

## Deploying

The client is Cloudflare Pages, the API is a Worker over D1, and identity is
Clerk on `games.aclogics.com`.

```bash
# 1. Database
npx wrangler d1 create quadro                    # put the id in wrangler.jsonc
npx wrangler d1 execute quadro --remote --file worker/schema.sql

# 2. Worker secrets (never in the repo, never in the client bundle)
npx wrangler secret put CLERK_SECRET_KEY

# 3. API
npx wrangler deploy

# 4. Client
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... npm run build
npx wrangler pages deploy dist --project-name quadro
```

`public/_redirects` gives Pages the SPA fallback the deep links need;
`public/_headers` carries the CSP. `CLERK_ISSUER` and `ALLOWED_ORIGIN` are
plain vars in `wrangler.jsonc`; the publishable key is a build-time public
variable. No secret ever reaches the client.
