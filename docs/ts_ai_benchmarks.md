# TypeScript agent benchmarks

Results of `npm run bench` (`web/test/strength.bench.ts`), the TypeScript side of
the port-parity gate (BUILD-SPEC §14.5, AC-030).

Engine state transitions are asserted exactly by `test/parity.test.ts`. Agent
*move choice* is not: equal-valued actions break ties on iteration order, which
differs between Python and TypeScript. Strength is therefore asserted
statistically here instead.

Targets, from [docs/ai_benchmarks.md](../../docs/ai_benchmarks.md):

| pair | target win rate |
|---|---|
| greedy vs random | > 90% |
| minimax (depth 4) vs greedy | > 65% |
| mcts (450ms) vs minimax | >= 55% |

Each run appends a section below. A run is only a release gate at 120+ games per
pair with the default 450ms budget; shorter runs are for smoke-checking a change.

## Run 2026-08-29T00:12:23.774Z

Node v25.8.2 on darwin/arm64. 120 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| greedy-vs-random | 120 | 120 | 0 | 0 | 100.0% | 90% | pass | 1ms | 0.1ms |

## Run 2026-08-29T00:46:03.942Z

Node v25.8.2 on darwin/arm64. 120 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| minimax-vs-greedy | 120 | 106 | 13 | 1 | 88.3% | 65% | pass | 451ms | 52.0ms |
| mcts-vs-minimax | 120 | 108 | 12 | 0 | 90.0% | 55% | pass | 451ms | 267.3ms |

## Run 2026-08-31T04:16:38.796Z

Node v25.8.2 on darwin/arm64. 60 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| medium-vs-easy | 60 | 57 | 3 | 0 | 95.0% | 75% | pass | 2ms | 0.2ms |
| hard-vs-medium | 60 | 46 | 14 | 0 | 76.7% | 65% | pass | 84ms | 3.8ms |
| expert-vs-hard | 60 | 44 | 16 | 0 | 73.3% | 55% | pass | 377ms | 19.4ms |
| master-vs-expert | 60 | 37 | 23 | 0 | 61.7% | 55% | pass | 451ms | 73.7ms |

## Run 2026-08-31T04:26:40.783Z

Node v25.8.2 on darwin/arm64. 40 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| extreme-vs-master | 40 | 35 | 5 | 0 | 87.5% | 55% | pass | 827ms | 282.0ms |

## Run 2026-08-31T04:56:59.757Z

Node v25.8.2 on darwin/arm64. 60 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| expert-vs-hard | 60 | 35 | 24 | 1 | 58.3% | 55% | pass | 409ms | 25.3ms |
| master-vs-expert | 60 | 25 | 33 | 2 | 41.7% | 55% | FAIL | 451ms | 68.3ms |

## Run 2026-08-31T05:02:43.017Z

Node v25.8.2 on darwin/arm64. 60 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| master-vs-expert | 60 | 38 | 19 | 3 | 63.3% | 55% | pass | 457ms | 84.5ms |

## Run 2026-08-31T05:12:06.094Z

Node v25.8.2 on darwin/arm64. 40 games per pair, 450ms budget, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| extreme-vs-master | 40 | 29 | 10 | 1 | 72.5% | 55% | pass | 487ms | 239.8ms |

## Run 2026-09-01T22:11:20.616Z

Node v25.8.2 on darwin/arm64. 40 games per pair, 128 extreme simulations, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| medium-vs-easy | 40 | 39 | 1 | 0 | 97.5% | 75% | pass | 327ms | 8.4ms |
| hard-vs-medium | 40 | 30 | 8 | 2 | 75.0% | 55% | pass | 1167ms | 19.9ms |
| expert-vs-hard | 40 | 28 | 12 | 0 | 70.0% | 55% | pass | 966ms | 46.6ms |
| master-vs-expert | 40 | 25 | 14 | 1 | 62.5% | 55% | pass | 1855ms | 128.1ms |
| extreme-vs-master | 40 | 15 | 25 | 0 | 37.5% | 55% | FAIL | 4840ms | 418.3ms |

## Run 2026-09-01T22:25:07.981Z

Node v25.8.2 on darwin/arm64. 20 games per pair, 256 extreme simulations, seats swapped every game.

| pair | games | W | L | D | win rate | target | result | max move | mean move |
|---|---|---|---|---|---|---|---|---|---|
| extreme-vs-master | 20 | 9 | 11 | 0 | 45.0% | 55% | FAIL | 7006ms | 722.4ms |
