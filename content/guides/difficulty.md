---
title: The six Quadro opponents, explained
description: What Easy, Medium, Hard, Expert, Master and Extreme actually do — the algorithm behind each, measured head-to-head win rates, and which leaderboard is worth chasing.
updated: 2026-08-30
---

Quadro ships six AI opponents built from three algorithms. They are not difficulty sliders on one engine; they genuinely think in different ways, and they lose in different ways. All six run in your browser — nothing is sent to a server to pick a move, which is why [Practice](/practice) works offline.

## The ladder

| Level | Algorithm | What it does |
| --- | --- | --- |
| Easy | Greedy, half-random | Takes the best immediate move half the time, and a random legal move the other half |
| Medium | Minimax, depth 2 | Sees your reply to its move, and nothing after that |
| Hard | Minimax, depth 3 | Sees its own follow-up too |
| Expert | Minimax, depth 4, narrowed | Plans full-depth lines, but only down the eight best-looking moves |
| Master | Minimax, depth 4, full width | The same depth with nothing pruned away |
| Extreme | Monte Carlo tree search | Samples playouts for ~450ms per move instead of searching a fixed depth |

## What separates each rung

**Easy** is deliberately erratic rather than merely weak. It knows what a good immediate move looks like and abandons that judgment about half the time, so it will occasionally punish you and often hand you a round. It is the right opponent for your first few games.

**Medium** stops being random. At depth 2 it will not walk into an obvious punish, but it has no plan — it cannot see the round settling, so it will happily fill a pattern line it has no way to complete.

**Hard** adds one ply, which is enough for it to set something up and follow through. This is where the floor line starts costing you: it will leave you a factory where every draw overflows.

**Expert and Master** search to the same depth. The difference is width — Expert only considers the eight moves that look best at first glance, so it plans deep, correct-looking lines and then misses the quiet move that refutes them. Master considers everything at that depth. In measured head-to-head play Master beats Expert about 62% of the time, which is a real but narrow gap, and it is the most interesting pair on the ladder to play back to back.

**Extreme** changes method entirely. Instead of searching every line to a fixed depth, it plays out thousands of sampled games per move and keeps what wins. That makes it much better than the minimax levels at long, quiet positions where no single line is forcing — the endgame, mostly, where it will out-plan you on column bonuses. Its budget is about 450 milliseconds per move.

## Measured strength

From the repository's own benchmark runs, each level against the one below it, seats swapped every game:

| Matchup | Games | Win rate |
| --- | --- | --- |
| Medium vs Easy | 60 | 95.0% |
| Hard vs Medium | 60 | 76.7% |
| Expert vs Hard | 60 | 73.3% |
| Master vs Expert | 60 | 61.7% |
| Extreme vs Master | 40 | 87.5% |

The ladder tightens in the middle and opens up again at the top. Extreme is not a small step past Master; it is a different kind of player.

## Which board should you chase?

Every level has [its own leaderboard](/leaderboard), and the boards are never mixed — a margin against Easy and a margin against Extreme are not the same achievement, and averaging them would say nothing.

That gives you two honest ways to compete:

- **Beat a strong opponent at all.** Against Extreme, a positive margin is a genuine result and the board is thin at the top.
- **Beat a weak opponent by a landslide.** Against Easy the margins are enormous, so the board becomes a pure optimization puzzle: given today's deal, how large can the gap be made?

Both are real. Pick the one you find more interesting, and remember that on the [Daily](/daily) you get one recorded attempt per opponent per day — so you can hold a place on several boards at once.

## Next

- [Strategy](/guide/strategy) — what to actually do against them.
- [How scoring works](/guide/scoring) — margin is the number on the board, not raw score.
