"""EvE batch benchmark: win rates, score margins and per-move timing.

    python -m scripts.benchmark --p0 greedy --p1 random --games 200 --swap

Fairness (docs/plans/03-ai.md §4): with --swap each pair of games uses the *same*
seed, so both agents face the same tile order from both seats. That paired
design removes most of the variance that comes from the deal itself.
"""

from __future__ import annotations

import argparse
import math
import statistics
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ai import LEVELS, make_agent
from engine import QuadroGame

REPORT = Path(__file__).resolve().parents[2] / "docs" / "ai_benchmarks.md"


@dataclass(slots=True)
class GameOutcome:
    seed: int
    swapped: bool  # True when p1's agent sat in seat 0
    scores: tuple[int, int]  # indexed by *agent*, not by seat
    rounds: int
    winner: int | None  # agent index, or None for a draw
    move_times: list[float]


def play(seed: int, level_a: str, level_b: str, swapped: bool) -> GameOutcome:
    """One game. `level_a` is agent 0; `swapped` seats it as player 1."""
    seat_levels = (level_b, level_a) if swapped else (level_a, level_b)
    agents = [make_agent(level, seed=seed * 2 + i) for i, level in enumerate(seat_levels)]
    game = QuadroGame(seed=seed)
    times: list[float] = []

    while not game.is_over():
        seat = game.current
        start = time.perf_counter()
        action = agents[seat].choose(game.state, seat)
        times.append(time.perf_counter() - start)
        game.step(action)

    result = game.result()
    seat_of_agent0 = 1 if swapped else 0
    scores = (result.scores[seat_of_agent0], result.scores[1 - seat_of_agent0])
    winner = None if result.draw else (0 if result.winner == seat_of_agent0 else 1)
    return GameOutcome(seed, swapped, scores, result.rounds, winner, times)


def _play_star(args: tuple) -> GameOutcome:
    return play(*args)


def wilson(wins: float, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval — honest at the small game counts we run by hand."""
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def summarize(outcomes: list[GameOutcome], level_a: str, level_b: str) -> str:
    n = len(outcomes)
    wins = sum(1 for o in outcomes if o.winner == 0)
    losses = sum(1 for o in outcomes if o.winner == 1)
    draws = n - wins - losses
    # A draw counts as half a win, the usual convention for match scores.
    points = wins + 0.5 * draws
    low, high = wilson(points, n)
    margins = [o.scores[0] - o.scores[1] for o in outcomes]
    times = [t for o in outcomes for t in o.move_times]

    lines = [
        f"**{level_a}** vs **{level_b}** — {n} games"
        + (" (swapped seats)" if any(o.swapped for o in outcomes) else ""),
        "",
        f"- win rate: **{points / n:.1%}** (95% CI {low:.1%}–{high:.1%}) — "
        f"{wins}W / {draws}D / {losses}L",
        f"- mean score: {statistics.mean(o.scores[0] for o in outcomes):.1f} vs "
        f"{statistics.mean(o.scores[1] for o in outcomes):.1f} "
        f"(margin {statistics.mean(margins):+.1f})",
        f"- rounds/game: {statistics.mean(o.rounds for o in outcomes):.1f}",
        f"- move time: mean {statistics.mean(times) * 1000:.1f}ms, "
        f"max {max(times) * 1000:.1f}ms",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Quadro AI benchmark")
    parser.add_argument("--p0", default="greedy", choices=LEVELS)
    parser.add_argument("--p1", default="random", choices=LEVELS)
    parser.add_argument("--games", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--swap", action="store_true", help="each seed played from both seats")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--report", action="store_true", help="append to docs/ai_benchmarks.md")
    args = parser.parse_args(argv)

    jobs = []
    for i in range(args.games):
        seed = args.seed + (i // 2 if args.swap else i)
        swapped = args.swap and i % 2 == 1
        jobs.append((seed, args.p0, args.p1, swapped))

    started = time.perf_counter()
    if args.workers > 1:
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            outcomes = list(pool.map(_play_star, jobs, chunksize=4))
    else:
        outcomes = [_play_star(job) for job in jobs]
    elapsed = time.perf_counter() - started

    summary = summarize(outcomes, args.p0, args.p1)
    print(summary)
    print(f"- wall clock: {elapsed:.1f}s")

    if args.report:
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        with REPORT.open("a") as fh:
            fh.write(f"\n## {stamp} — seed {args.seed}\n\n{summary}\n")
        print(f"\nappended to {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
