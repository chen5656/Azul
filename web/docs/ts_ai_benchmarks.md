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
