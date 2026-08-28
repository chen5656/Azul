# Quadro

A tile-drafting board game: rules engine, AI opponents, and a web client.
Two players, five colors, a 5×5 grid to fill and a penalty row to avoid.

Current status: **Phase 1 complete** — the rules engine and a playable terminal
client. See [PLAN.md](PLAN.md) for the roadmap and [docs/plans/](docs/plans/)
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
.venv/bin/python -m scripts.cli --p1 random        # play the random agent
.venv/bin/python -m scripts.cli --auto random random --games 1000
.venv/bin/python -m scripts.cli --replay game.json
```

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

## Layout

```
backend/
  engine/    rules engine — pure Python, no dependencies
  scripts/   cli.py (terminal client), later benchmark.py and replay.py
  tests/
docs/plans/  per-module design documents
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest --cov=engine
```

93 tests, 99% engine coverage. They cover every edge case listed in the engine
plan, plus a fuzz pass that plays random games while asserting the invariants
(tiles are conserved, scores never go negative, no color repeats on a grid row
or column, exactly one first-player token exists).
