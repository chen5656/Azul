# Quadro Daily: one board, one AI, one clock

- **Status:** Draft
- **Date:** 2026-08-28
- **Planned software version:** v1.0.0
- **Feature slug:** `web-ts-daily-challenge`
- **Companion document:** [BUILD-SPEC.md](BUILD-SPEC.md)
- **Product:** Quadro (`/Users/huajun/Code/Azul`), shipping at `games.aclogics.com`
- **Primary customer:** A tile-drafting board game player who wants a short, repeatable, competitive solo puzzle
- **One-line outcome:** Every day, the same deal for everybody, the same AI opponent for everybody, and one global board that ranks whoever beat it fastest

## Problem to Solve

### The player who has nobody to play with

Quadro today is a game you can only play if a server is running for you. The
rules engine, the four AI levels and the whole game session live in Python on a
FastAPI process (`backend/app/main.py`, `backend/app/game_manager.py`); the
React client at `frontend/` is a thin renderer that only highlights the
`legal_actions` set the server hands it. That means there is no such thing as
opening the game and playing. There is a `pip install`, a `uvicorn` command, a
second terminal, and an `npm run dev`. The only people who have ever played
Quadro are people who could clone the repository.

The player we care about has ten minutes, a browser, and no interest in any of
that. They want to sit down, get a board, and be beaten or not beaten by
something that plays well.

### Playing alone gets boring before it gets good

Even for the developer-players who do get it running, a solo game against an AI
has no shape. You play, you win or lose, and nothing accumulates. There is no
reason to come back tomorrow and no way to know whether your 61 points was good.
The benchmark numbers in [docs/ai_benchmarks.md](../../ai_benchmarks.md) tell us
MCTS beats Minimax 67.9% of the time — but a human has no equivalent number for
themselves, and no one to compare it to.

### The consequence

A finished, well-tested rules engine with four working AI levels and 103 passing
tests currently has an audience of one. Without a way to open a URL and play,
and without a reason to open that URL again tomorrow, the project has no players
and therefore no signal about whether the game or the AI is any good.

## How We Measure Success

### Observable success

- A player can open `games.aclogics.com` on a laptop or phone and be making a
  move in the Daily within roughly a minute, with no install and no sign-in.
- The Daily leaderboard has entries every day — real, distinct players who beat
  the MCTS agent on that day's deal.
- Returning players show up on more than one day's board.
- A player who loses network mid-practice keeps playing; the page does not break.

We are not setting numeric targets. This is the first public release of a game
with no existing audience, so there is no baseline to improve on. v1.0.0's job
is to produce the first real numbers, not to hit invented ones.

### Guardrails

- **The Daily must be identical for everybody.** Same date, same deal, same
  starting seat, every time, on every device.
- **A leaderboard time must mean something.** Only a win against the MCTS agent
  is admissible; losses and abandoned games never appear.
- **Practice must never touch the leaderboard.** Nothing a player does in
  practice can be submitted, and no practice result is stored anywhere.
- **Playing must not require an account.** Sign-in is the price of appearing on
  the board, not the price of playing.
- **Offline must degrade honestly.** With no network, the game plays and says
  plainly that nothing will be recorded.

## The Launch Post

### Quadro Daily is live at games.aclogics.com

**Every player in the world gets the same board every day. Beat the AI, and your
time goes on the wall.**

`games.aclogics.com` — 2026

Quadro is a tile-drafting game about filling a 5×5 grid without drowning in
penalties. Starting today it runs entirely in your browser: the rules engine and
all four AI levels have been rewritten in TypeScript and ship with the page. No
server decides your moves. No account, no install, no waiting.

The centrepiece is the **Daily**. At midnight New York time a new deal opens, and
it is the same deal for everyone. Your opponent is the Monte Carlo agent — the
strongest classical AI in the game, the one that beats our alpha-beta search
roughly two games in three. The clock starts on your first move and stops when
the game ends.

**Beat it and your time goes on the global board for that day.** Lose, and the
clock simply doesn't count. You can replay the day's deal as many times as you
like; only your fastest win is kept. Signing in with your account is what puts
you on the board — you can play first and sign in afterwards.

Alongside the Daily there is **Practice**: the same game against any of the four
AI levels, on any deal you want, offline-capable, with nothing recorded and
nothing at stake. It is where you learn what the Monte Carlo agent is going to do
to you tomorrow.

> "I stopped needing a second player. The Daily gives me eight minutes and a
> number, and the number is worse than my friend's number, so I play it again."
> — an early Quadro player

> "Porting the engine to the client was the whole feature. Once the rules and the
> search run in the browser, the game is just a web page — and the leaderboard is
> the only thing that needs a network."
> — Quadro engineering

**How it works.** Open the page. Pick Daily or Practice. In the Daily you get the
day's deal and the Monte Carlo opponent; take every tile of one color from one
display or from the center, drop it on a staging row or dump it on your penalty
row, and settle each round. There is no undo anywhere in Quadro — the move you
make is the move you made. Finish ahead of the AI and you are offered the
leaderboard; sign in if you have not already, and your time is posted.

**Try it:** [games.aclogics.com](https://games.aclogics.com)

## Other Details

### What we chose, and what it costs

| Choice | Why | What it costs |
|---|---|---|
| The whole engine and AI run in the browser (TypeScript) | No server round trip, instant moves, works offline, hosting is nearly free | The Python engine and its 103 tests become a *reference* implementation; the port has to be proven equivalent |
| Leaderboard trusts the client | Ships v1.0.0 in a fraction of the time; the alternative is running the engine again on a Worker | The board is forgeable by anyone with dev tools. Accepted for v1.0.0 |
| MCTS keeps its 450ms time budget | Same agent as everywhere else in the product, no second code path, no divergence from `docs/ai_benchmarks.md` | Strength varies slightly with device speed, and slower devices lose a little wall-clock time to AI thinking |
| Timing is total wall clock, AI thinking included | One number, no pause/resume machinery, nothing to game | A fast laptop has a real advantage over a phone |
| No undo, anywhere | The Daily has to be honest, and one rule is simpler than two | Practice loses a teaching aid it could have had |
| Sign-in only to post a score | Nobody bounces at a login wall | An unsigned player who wins has to sign in before their time counts |
| English only | One locale to write and review; the existing Chinese strings in `frontend/` are being replaced wholesale anyway | Existing Chinese-reading users lose the localized UI |

### Scope

**In scope for v1.0.0**

- A TypeScript port of the rules engine and of the `random`, `greedy`,
  `minimax` and `mcts` agents, running in the browser.
- Practice mode: any AI level, any seed, offline-capable, nothing recorded.
- Daily mode: one fixed deal per New York day, MCTS opponent, wall-clock timing,
  unlimited retries, best winning time kept.
- Today's global leaderboard, with the signed-in player's own rank.
- Clerk sign-in on `games.aclogics.com`, required only to submit.
- Cloudflare Pages + a Worker API + a D1 database for scores.

**Explicitly not in scope**

- Any form of player-versus-player, online or hot-seat.
- The AzulZero / AlphaZero agent (`backend/zero/`, `backend/ai/azulzero_agent.py`)
  — it stays out of the client build entirely.
- Any in-browser AI training or self-play learning.
- Historic-day leaderboards, all-time rankings, streaks, and per-player history.
- Server-side replay validation or server-side timing.
- Removing or rewriting the Python `backend/` — it stays as the reference.

### Risks worth knowing about

- **The leaderboard is forgeable.** A determined player can post any time they
  like. We are shipping anyway, because the alternative delays v1.0.0
  substantially and the board has no prize attached. If the board is visibly
  polluted, the mitigation is the replay-validation path already sketched in the
  build spec.
- **Port fidelity.** A rules bug that exists in the TypeScript engine but not in
  the Python one produces a Daily that is subtly a different game. The build spec
  makes parity against Python-generated vectors a release gate.
- **MCTS in JavaScript may be slower than in Python.** If a 450ms budget buys
  materially fewer simulations in the browser, the Daily opponent is weaker than
  the benchmarked agent. Measured before release; the fallback is to raise the
  budget for the Daily and say so.

### Alternatives considered

- **Keep the Python backend and just add a leaderboard.** Rejected: it keeps a
  server on the critical path of every move, rules out offline play, and makes
  hosting a running cost.
- **Server-authoritative timing and replay validation.** Rejected for v1.0.0:
  it means porting the engine to the Worker as well and roughly doubles the
  surface. Deferred, not discarded.
- **Rank by score instead of time.** Rejected: score ties are common and a score
  board rewards grinding a solved position; a clock rewards knowing the game.

### Unresolved decisions

None that block implementation. Two items are recorded in the build spec as
assumptions the implementer should follow unless told otherwise: the human plays
seat 0 and moves first in the Daily, and the leaderboard display name comes from
the Clerk profile.

### Handoff

Requirements, data model, API contracts, the Daily seed derivation, the port
parity strategy and all acceptance criteria are in
[BUILD-SPEC.md](BUILD-SPEC.md).
