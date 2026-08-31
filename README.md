# Quadro

A browser-native, full-stack implementation of a tile-drafting board game, inspired by **Azul**. Built with TypeScript, React, Vite, and Cloudflare Workers + D1.

The game runs **100% client-side**, using Web Workers for AI computation, with an offline **Practice** mode, a guided **Tutorial**, and a competitive **Daily Challenge** backed by global leaderboards.

**▶ Play it now: [acgame.win](https://acgame.win)**

---

## Features

- **Client-Side Engine**: A pure TypeScript rules engine running in-browser — no server roundtrip, fully deterministic, zero dependencies.
- **Background AI Web Workers**: Opponents search off the main thread, keeping the UI responsive at 60 FPS.
- **Game Modes**:
  - **Tutorial**: A scripted walkthrough of drafting, wall tiling, penalties, and scoring for first-time players.
  - **Practice**: Offline and unranked. Play any of the six AI levels, or replay a specific seed.
  - **Daily Challenge**: One synchronized deal per day (New York midnight rollover), with a separate leaderboard per AI level — your score is the **margin of victory**, so beating a harder opponent by more points ranks higher.
- **Edge Backend**: Cloudflare Pages for static assets, Cloudflare Workers + D1 for leaderboards, and Clerk for authentication.

---

## AI Opponents

Six levels share one zero-sum heuristic evaluation function (`src/ai/evaluate.ts`) but differ in search horizon and game-theoretic technique. Each level is benchmarked to beat the level below it (`npm run bench`):

| Level | Core Algorithm | Decision Time | Play Style & Characteristics |
|:---|:---|:---|:---|
| `easy` | 1-ply lookahead, ε = 0.5 | < 5 ms | Scores the position after every immediate legal move (settling the round if the move ends it), then throws half of its choices away at random. Loses tempo and eats penalties it could see coming. |
| `medium` | Alpha-beta, depth 2 | < 30 ms | The first level with an opponent model: it sees the reply to its own move, so it stops handing over free colors and walking into forced penalties. |
| `hard` | Alpha-beta, depth 3 | 30–150 ms | Two of its own moves deep. Plans short denial sequences rather than single-move trades. |
| `expert` | Alpha-beta, depth 4 | 50–300 ms | Exploits the deterministic nature of an active round with move ordering and iterative deepening. Actively denies needed colors and forces floor penalties. |
| `master` | Alpha-beta, depth 5, width 8 | 30–450 ms | Trades width for a fifth ply: searches only the eight best-ordered moves per node, which is the only way the extra depth finishes inside the budget. |
| `extreme` | Open-loop determinized UCT | ~450 ms | Simulates future rounds via stochastic determinization. Thousands of rollouts plan cross-round combos and robust endgame scoring. |

### The ladder is measured, not assumed

A difficulty name is only worth something if the level behind it actually wins. `npm run bench` plays every level against the one below it, swapping seats each game so the first-player edge cancels out, and fails the run if any rung falls below its target. Latest results (450 ms budget, 60 games per rung, full history in `docs/ts_ai_benchmarks.md`):

| Rung | Win rate | Target |
|:---|:---|:---|
| `medium` vs `easy` | 95.0% | 75% |
| `hard` vs `medium` | 73.3% | 55% |
| `expert` vs `hard` | 61.7% | 55% |
| `master` vs `expert` | 63.3% | 55% |
| `extreme` vs `master` | 87.5% † | 55% |

† Measured against the previous full-width depth-4 `master`; the re-run against depth 5 is pending.

Two of these results shaped the design rather than confirming it. Full-width depth 5 loses to depth 4, because it cannot finish inside the move budget and falls back to the depth 4 answer — hence `master`'s narrow beam. And narrowing helps enough that a width-8 depth 4 *beat* full-width depth 4 outright, which is why width is not used as a difficulty knob anywhere below `master`.

### How the AI Computes, and Why It's Fair

A fair question is whether search agents like alpha-beta and MCTS "peek into the future". **The game is strictly symmetric with zero hidden information:**

1. **Perfect information with stochastic events.** Like Backgammon, the bag's distribution is fully public (100 tiles, 20 of each color). Any player can deduce the exact bag composition by subtracting the visible tiles (factories, center pool, player boards, discard lid) from the total.
2. **Alpha-beta is strictly intra-round.** Its search tree terminates at the round boundary (`drafting_done()`). It only computes tactical traps among the tiles already dealt and visible.
3. **MCTS samples, it does not foresee.** When simulating across a round boundary, it performs **open-loop determinization**: each simulation deals its own random hand from the remaining bag distribution, statistics are gathered over thousands of plausible futures, and the robust child is chosen. When the next round actually begins, the engine deals a fresh hand from its own authoritative RNG.

---

## Tech Stack & Architecture

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, PWA support
- **AI / Engine**: TypeScript Web Workers (`src/workers/`)
- **Backend & Storage**: Cloudflare Workers, Cloudflare D1 (serverless SQL)
- **Auth**: Clerk

```
src/
  ai/          epsilon-greedy, greedy, alpha-beta (d2/d3/d4), UCT + shared evaluation heuristic
  components/  React UI components, boards, factories, controls
  daily/       daily challenge seed derivation & deal logic
  engine/      pure TypeScript game engine (deterministic, zero-dependency)
  game/        game state management & client controllers
  routes/      page views (Home, Tutorial, Practice, Daily, Leaderboard)
  tutorial/    scripted tutorial flow & step state machine
  workers/     Web Worker for background AI computation
worker/        Cloudflare Worker endpoints (/api/daily, /api/leaderboard, …)
test/          unit tests, parity tests, and benchmark suites
```

---

## Development

### Prerequisites

- Node.js >= 20
- npm >= 10

### Local Setup

```bash
git clone https://github.com/your-username/Azul.git
cd Azul
npm install
npm run dev   # http://localhost:5173
```

### Testing & Verification

```bash
# Unit and integration tests (engine, UI, worker)
npm test

# Type checking (app and worker)
npm run typecheck

# AI benchmark suite (win rates between adjacent levels)
npm run bench -- --games 20 --budget 0.1
```

---

## Deployment

The app runs on Cloudflare Pages and Cloudflare Workers.

```bash
npm run build
npx wrangler pages deploy dist --project-name quadro --branch main
npx wrangler deploy
```

The Worker verifies Clerk sessions against the instance JWKS public keys, so no session secrets are stored.

Database migrations live in `worker/migrations/` and are applied with:

```bash
npx wrangler d1 execute quadro --remote --file worker/migrations/002_level_rename.sql
```

---

## SEO & static pages

The app is client-rendered, which on its own gives every route the same title
and gives a crawler no text at all. `scripts/seo-build.mjs` runs after
`vite build` (it is part of `npm run build`) and fixes that without introducing
SSR:

- **One HTML file per SPA route** — `/`, `/daily`, `/practice`, `/tutorial`,
  `/leaderboard` each get their own title, description, canonical, OG/Twitter
  tags, and a short crawler-visible block inside `#root` that React replaces the
  moment it mounts. Route metadata lives in `seo/site.mjs`.
- **Static guide pages** at `/guide`, rendered from `content/guides/*.md` by a
  small markdown subset in `seo/markdown.mjs`. These are plain HTML with no
  JavaScript, carrying `BreadcrumbList` and (on the FAQ) `FAQPage` JSON-LD.
- **`sitemap.xml`**, plus `robots.txt` and the OG image from `public/`.
- **A re-stamped service-worker revision** for `index.html`, since Workbox
  hashes the shell before this pass rewrites it.

To add a guide, drop a markdown file in `content/guides/` with `title`,
`description` and `updated` frontmatter (add `faq: true` for FAQ markup) and
list its slug in `GUIDES` in `seo/site.mjs`. The build fails if a listed slug
has no file or is missing frontmatter.

The generated OG image is `public/og.png`, rendered once from a standalone HTML
card; regenerate it with any headless browser at 1200×630.

---

## Attribution & Disclaimer

Quadro is an independent, open-source implementation inspired by the tile-drafting mechanics of the board game **Azul**, designed by Michael Kiesling.

This project is not affiliated with, endorsed by, or sponsored by Plan B Games, Next Move Games, or Asmodee. "Azul" and all related trademarks belong to their respective owners; they are used here only to describe the mechanics this project draws on. No original artwork, text, or components from the published game are reproduced.

---

## License

MIT License. The license covers this project's own source code only.
