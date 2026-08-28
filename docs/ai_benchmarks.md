# AI 基准结果

每条记录由 `python -m scripts.benchmark ... --report` 追加。`--swap` 表示每个种子由双方各执一次先手（配对样本，消除发牌方差）。胜率把平局计为半胜，区间为 Wilson 95% 置信区间。

出口条件（docs/plans/03-ai.md §5）：Greedy vs Random > 90%；Minimax(d4) vs Greedy > 65%；MCTS(500ms) vs Minimax(d4) ≥ 55%；每步 ≤ 500ms。

## 当前结论（2026-08-28）

| 对阵 | 局数 | 胜率 | 要求 | 结果 |
|------|------|------|------|------|
| Greedy vs Random | 500 | 100.0% | > 90% | ✅ |
| Minimax(d4) vs Greedy | 200 | 88.5% | > 65% | ✅ |
| MCTS(450ms) vs Minimax(d4) | 120 | 67.9% | ≥ 55% | ✅ |
| MCTS(450ms) vs Greedy | 120 | 90.8% | — | — |

每步耗时最大值：Greedy 5ms / Minimax 499ms / MCTS 473ms，全部 ≤ 500ms。

注意 MCTS 对 Minimax 的**平均分反而低 2.6 分**：它优化的是胜负而非分差，
终局奖励是 ±1，所以领先时会选更稳的线路而不是更贵的线路。这是设计使然。

详细记录：

## 2026-08-28 17:20 UTC — seed 42

**greedy** vs **random** — 500 games (swapped seats)

- win rate: **100.0%** (95% CI 99.2%–100.0%) — 500W / 0D / 0L
- mean score: 61.4 vs 0.9 (margin +60.5)
- rounds/game: 5.0
- move time: mean 0.2ms, max 5.1ms

## 2026-08-28 17:22 UTC — seed 42

**minimax** vs **greedy** — 200 games (swapped seats)

- win rate: **88.5%** (95% CI 83.3%–92.2%) — 177W / 0D / 23L
- mean score: 55.4 vs 35.4 (margin +20.1)
- rounds/game: 5.0
- move time: mean 88.1ms, max 499.1ms

## 2026-08-28 17:27 UTC — seed 42

**mcts** vs **minimax** — 120 games (swapped seats)

- win rate: **67.9%** (95% CI 59.1%–75.6%) — 81W / 1D / 38L
- mean score: 30.9 vs 33.5 (margin -2.6)
- rounds/game: 5.0
- move time: mean 305.9ms, max 472.6ms

## 2026-08-28 17:30 UTC — seed 42

**mcts** vs **greedy** — 120 games (swapped seats)

- win rate: **90.8%** (95% CI 84.3%–94.8%) — 109W / 0D / 11L
- mean score: 48.8 vs 39.3 (margin +9.4)
- rounds/game: 5.0
- move time: mean 217.9ms, max 457.2ms
