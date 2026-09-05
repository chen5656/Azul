---
title: The six MirrorLink AI opponents, explained
description: What Easy, Medium, Hard, Expert, Master and Extreme actually do — the neural algorithm behind each, measured win rates, and which leaderboard is worth chasing.
updated: 2026-09-05
---

MirrorLink ships six synthetic AI adversaries built from three algorithmic paradigms. They represent the progressive awakening of the synthetic replica's cognitive architecture — from erratic heuristic mimicry to deep Monte Carlo foresight. All six run locally in your browser with zero network latency, which is why [Practice](/practice) works offline.

## The cognitive ladder

| Level | Neural Architecture | Cognitive Behavior |
| --- | --- | --- |
| Easy | Greedy, stochastic | Extracts the highest immediate reward half the time; makes random exploratory moves the other half |
| Medium | Minimax, depth 2 | Anticipates your immediate counter-response, but lacks multi-turn foresight |
| Hard | Minimax, depth 3 | Plans multi-turn combos; weaponizes the buffer to force hallucination penalties |
| Expert | Minimax, depth 4 (pruned) | Deep foresight narrowed to the top 8 branches |
| Master | Minimax, depth 4 (full width) | Exhaustive full-depth calculation with zero branch pruning |
| Extreme | Monte Carlo Tree Search (MCTS) | Simulates thousands of cognitive rollouts (~450ms/turn) for dominant endgame memory control |

## What separates each rung

**Easy** is deliberately erratic rather than merely weak. It knows what a good immediate move looks like and abandons that judgment about half the time, so it will occasionally punish you and often hand you a round. It is the right adversary for your first few games.

**Medium** stops being random. At depth 2 it will not walk into an obvious trap, but it lacks holistic foresight — it cannot predict round settlement, so it will happily start a context line it has no way to complete.

**Hard** adds an extra layer of depth, enough to set up traps and follow through. This is where hallucinations start costing you: it will manipulate attention nodes to leave you with draws that inevitably overflow.

**Expert and Master** search to the same depth. The difference is width — Expert only considers the eight moves that look best at first glance, so it plans deep lines but can miss quiet refutations. Master considers everything at that depth. In measured head-to-head play Master beats Expert about 62% of the time.

**Extreme** changes paradigm entirely. Instead of searching a fixed tree depth, it runs thousands of Monte Carlo rollouts per move to discover non-obvious emergent winning lines. That makes it devastating at long-range memory positioning and column bonuses.

## Measured strength

From the repository's own benchmark runs, each level against the one below it, seats swapped every game:

| Matchup | Games | Win rate |
| --- | --- | --- |
| Medium vs Easy | 60 | 95.0% |
| Hard vs Medium | 60 | 76.7% |
| Expert vs Hard | 60 | 73.3% |
| Master vs Expert | 60 | 61.7% |
| Extreme vs Master | 40 | 87.5% |

## Which board should you chase?

Every AI level has [its own leaderboard](/leaderboard), and the boards are never mixed.

That gives you two distinct ways to compete:

- **Conquer a superintelligent adversary.** Against Extreme, securing a positive margin is a genuine achievement against an advanced MCTS engine.
- **Maximize margin against weaker tiers.** Against Easy, the margin can be pushed dramatically through aggressive buffer denial and hallucination bombing.

Pick the challenge you find most engaging, and remember that on the [Daily](/daily) you get one recorded attempt per opponent per day.

## Next

- [The Story: The Mirror Link Protocol](/guide/story) — the sci-fi lore.
- [Strategy](/guide/strategy) — cognitive tactics and buffer control.
- [How scoring works](/guide/scoring) — margin calculation and memory bonuses.
