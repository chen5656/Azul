# Quadro

A tile-drafting board game: rules engine, AI opponents, and a web client.
Two players, five colors, a 5×5 grid to fill and a penalty row to avoid.

Current status: **Phase 3 complete** — the rules engine, a playable terminal
client, a browser-playable vertical slice (FastAPI + React), and four AI levels
you can pick from the setup screen. See [PLAN.md](PLAN.md) for the roadmap and [docs/plans/](docs/plans/)
for per-module designs.

## Play it now

```bash
cd backend
python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m scripts.cli
```

Two players share the keyboard. Every turn the client prints the table, lists
each legal move with what it would cost you, and after each round prints the
full scoring breakdown — which tile scored what, and why.

```
Round 3   P0 (you) to move   bag 41  discard 12

  D0 [B Y Y W]   D1 [· · · ·]   D2 [B K K W]
  D3 [B B B Y]   D4 [· · · ·]
  center [R R R K W T]

┌◆ P0 you ────── 24 pts ┐   ┌─ P1 ────────── 19 pts ┐
│         · │ B y r k w │   │         · │ b y r k w │
│       Y Y │ b Y r k w │   │       · · │ b y R k w │
│     R R · │ b y R k w │   │     B B B │ B y r k w │
│   · · · · │ b y r k w │   │   W · · · │ b y r K w │
│ · · · · · │ b y r k W │   │ · · · · · │ b y r k w │
│ T R · · · · ·  -2     │   │ · · · · · · ·   0     │
└───────────────────────┘   └───────────────────────┘

  [ 0]     D0 blue   -> row 1 (1/1 placed)
  [ 3]     D2 white  -> row 2 (2/2 placed, 1 overflow, penalty -2)
  [ 7]  center red   -> row 3 (3/3 placed, penalty -1, takes token)
```

Uppercase is a placed tile, lowercase is an empty grid cell showing which color
belongs there, `T` is the first-player token.

Type a move number, or shorthand like `d2 y 3` (display 2, yellow, staging row
3) and `c r f` (center, red, dump onto the penalty row). `help` lists the rest:
`undo`, `save FILE`, `moves`, `board`, `quit`.

Other modes:

```bash
.venv/bin/python -m scripts.cli --seed 42          # reproducible deal
.venv/bin/python -m scripts.cli --p1 greedy        # play the greedy agent
.venv/bin/python -m scripts.cli --auto random random --games 1000
.venv/bin/python -m scripts.cli --replay game.json
```

## Play it in the browser

Two terminals:

```bash
cd backend && .venv/bin/pip install -e ".[server,dev]"
.venv/bin/python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Pick a mode, press 开始, then click a color group and click a highlighted row.
Legality is decided entirely by the server: the client only highlights the
`legal_actions` set it is sent. The game lives on the server, so refreshing the
page resumes exactly where you were. The wire format is in
[docs/protocol.md](docs/protocol.md).

## Rules

Each round every display is filled with 4 tiles from the bag. On your turn you
take **every tile of one color** from one display or from the center; whatever
is left on that display slides into the center. The tiles go onto one staging
row, and anything that does not fit spills onto your penalty row. Taking from
the center first also hands you the first-player token, which costs a penalty
slot but leads the next round.

When the table is empty the round settles: every *full* staging row moves one
tile onto the grid and scores its horizontal and vertical runs, the rest goes
to the discard pile, and the penalty row is charged and cleared. The game ends
after the round in which someone completes a horizontal grid row. Then come the
bonuses: +2 per full row, +7 per full column, +10 per color collected five times.

Full specification, including every edge case: [docs/plans/01-engine.md](docs/plans/01-engine.md).

## AI levels

| Level | Agent | How it decides |
|-------|-------|----------------|
| 0 | `random` | uniform over legal moves; the baseline |
| 1 | `greedy` | one ply over the shared evaluation in `ai/evaluate.py` |
| 2 | `minimax` | alpha-beta inside the round, iterative deepening to depth 4 |
| 3 | `mcts` | open-loop determinized UCT, greedy rollouts, 450ms budget |

A round is a perfect-information game once the displays are dealt — the bag's
composition is public and only the draw order is random — so minimax needs no
information-set machinery, and MCTS only redraws the bag when a playout crosses
a round boundary. See [docs/plans/03-ai.md](docs/plans/03-ai.md).

Run a match between any two of them:

```bash
cd backend
.venv/bin/python -m scripts.benchmark --p0 minimax --p1 greedy --games 200 --swap --workers 8
```

`--swap` plays each deal from both seats, so neither agent is helped by the
tiles. Add `--report` to append the result to
[docs/ai_benchmarks.md](docs/ai_benchmarks.md).

## Layout

```
backend/
  engine/    rules engine — pure Python, no dependencies
  ai/        agents: random, greedy, minimax (in-round alpha-beta), mcts
  app/       FastAPI server: REST lifecycle + one WebSocket per game
  scripts/   cli.py (terminal client), benchmark.py (EvE match runner)
  tests/
frontend/    Vite + React + TypeScript client
docs/
  plans/     per-module design documents
  protocol.md  wire format, generated from app/schemas.py
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest --cov=engine
```

103 tests, 99% engine coverage. They cover every edge case listed in the engine
plan, plus a fuzz pass that plays random games while asserting the invariants
(tiles are conserved, scores never go negative, no color repeats on a grid row
or column, exactly one first-player token exists). The server tests play a
whole PvE game over a real WebSocket, check that illegal actions change
nothing, that two sockets see identical broadcasts, and that the exported log
replays to the same final state.
