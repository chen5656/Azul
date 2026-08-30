# Quadro

A full-stack, browser-native implementation of the tile-drafting board game (Azul-inspired). Built with TypeScript, React, Vite, and Cloudflare Workers + D1.

The game runs **100% client-side** in the browser using Web Workers for AI computations, featuring offline **Practice** modes and a competitive **Daily Challenge** with a global leaderboard.

Play live at: **[games.aclogics.com](https://games.aclogics.com)**

---

## Features

- **Client-Side Engine**: Pure TypeScript rules engine running in-browser with zero server roundtrip latency.
- **Background AI Web Workers**: AI opponents calculate moves off the main thread via Web Workers, keeping the UI responsive at 60 FPS.
- **Game Modes**:
  - **Practice Mode**: Offline & unranked. Play against any AI level (Random, Greedy, Minimax, MCTS) or with custom seeds.
  - **Daily Challenge**: One synchronized deal per day (New York midnight rollover) against the MCTS agent, timed, with global leaderboards for the fastest wins.
- **Edge Backend**: Cloudflare Pages for static assets + Cloudflare Workers & D1 for leaderboard and Clerk authentication.

---

## AI Opponents

The game features four AI levels, all sharing a zero-sum heuristic evaluation function (`src/ai/evaluate.ts`) but utilizing different search horizons and game-theoretic techniques:

| Level | Agent | Core Algorithm | Decision Time | Play Style & Characteristics |
|:---|:---|:---|:---|:---|
| 0 | `random` | Uniform random choice | < 1ms | Uniform baseline and fuzz testing. |
| 1 | `greedy` | 1-Ply Lookahead | < 5ms | Evaluates static score after every immediate legal move (settles the round if the move ends it). Plays for immediate gain; ignores opponent counterplay. |
| 2 | `minimax` | Alpha-Beta Pruning within the round (Depth 2–4) | 50–300ms | Exploits the deterministic nature of an active round with move ordering and iterative deepening. Actively denies needed colors and forces floor penalties. |
| 3 | `mcts` | Open-Loop Determinized UCT | ~450ms | Simulates future rounds using stochastic determinization. Evaluates thousands of random rollouts to plan cross-round combos and robust endgame scoring. |

### How the AI Computes & Game Fairness

A common question is whether search agents like Minimax and MCTS "peek into the future" or hold an unfair advantage over human players. **The game is strictly symmetric with zero hidden information:**

1. **Perfect Information Game:**
   Like Backgammon or Mancala, the game has perfect information with stochastic events. The tile bag's distribution is fully public (100 tiles, 20 of each color). Any player can deduce the exact bag composition by subtracting visible tiles (factories, center pool, player boards, discard lid) from the total.
2. **Minimax is strictly intra-round:**
   Minimax does **not** look into future rounds. Its search tree terminates at the round boundary (`drafting_done()`). It simply computes tactical traps within the currently dealt, visible tiles.
3. **MCTS uses probabilistic sampling, not future-peeking:**
   When MCTS simulates moves across round boundaries, it does not know what tiles will actually be drawn next. Instead, it performs **Open-Loop Determinization**: each simulation independently deals a random hand from the remaining bag distribution, gathers win/loss statistics over thousands of plausible scenarios, and selects the move with the highest expected value (robust child). When the actual next round begins, the real game engine deals a fresh hand using its own authoritative RNG.

---

## Tech Stack & Architecture

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, PWA support
- **AI / Engine**: TypeScript Web Workers (`src/workers/`)
- **Backend & Storage**: Cloudflare Workers, Cloudflare D1 (Serverless SQL)
- **Auth**: Clerk

```
src/
  ai/          random, greedy, minimax, mcts + shared evaluation heuristic
  components/  React UI components, boards, factories, controls
  daily/       daily challenge puzzle seed derivation & deal logic
  engine/      pure TypeScript game engine (deterministic, zero-dependency)
  game/        game state management & client controllers
  routes/      page views (Practice, Daily Challenge, Leaderboard, Rules)
  workers/     Web Worker for background AI calculation
worker/        Cloudflare Worker endpoints (/api/daily, /api/leaderboard, etc.)
test/          unit tests, parity tests, and benchmark suites
```

---

## Development

### Prerequisites

- Node.js >= 20
- npm >= 10

### Local Setup

```bash
# Clone the repository
git clone https://github.com/your-username/Azul.git
cd Azul

# Install dependencies
npm install

# Start local Vite dev server (http://localhost:5173)
npm run dev
```

### Testing & Verification

```bash
# Run unit and integration tests (Engine, UI, Worker)
npm test

# Type checking (App and Worker)
npm run typecheck

# Run AI benchmark suite (evaluates win rates between AI levels)
npm run bench -- --games 20 --budget 0.1
```

---

## Deployment

The app is deployed on Cloudflare Pages and Cloudflare Workers.

```bash
# Build the client
npm run build

# Deploy client to Cloudflare Pages
npx wrangler pages deploy dist --project-name quadro --branch main

# Deploy the /api/* Cloudflare Worker
npx wrangler deploy
```

The Worker verifies Clerk sessions via instance JWKS public keys without storing sensitive secrets.

---

## License

MIT License.
