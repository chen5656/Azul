"""Gating: does the candidate actually beat the incumbent?

Every generation produces new weights; only ones that win a paired match are
promoted to `best`. Without that check, training noise alone will happily walk
the network backwards over a few generations.

Pairing follows `scripts/benchmark.py`: each seed is played twice, once from
each seat, so both networks face the identical deal from both sides and most of
the variance from the deal itself cancels.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .selfplay import SelfPlayConfig, play_batch


def wilson(wins: float, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval — honest at the game counts a gate actually runs."""
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, center - half), min(1.0, center + half))


@dataclass
class MatchResult:
    games: int
    wins: int
    draws: int
    losses: int
    mean_score_a: float
    mean_score_b: float

    @property
    def score(self) -> float:
        """Match score with draws worth half, the usual convention."""
        return (self.wins + 0.5 * self.draws) / self.games if self.games else 0.0

    @property
    def interval(self) -> tuple[float, float]:
        return wilson(self.wins + 0.5 * self.draws, self.games)

    def summary(self, name_a: str = "candidate", name_b: str = "best") -> str:
        low, high = self.interval
        return (
            f"{name_a} vs {name_b}: {self.score:.1%} "
            f"(95% CI {low:.1%}-{high:.1%}) — "
            f"{self.wins}W / {self.draws}D / {self.losses}L, "
            f"mean score {self.mean_score_a:.1f} vs {self.mean_score_b:.1f}"
        )


def duel(
    evaluator_a,
    evaluator_b,
    games: int = 200,
    config: SelfPlayConfig | None = None,
    simulations: int | None = None,
    seed: int = 12345,
) -> MatchResult:
    """Play `games` paired games between two evaluators. Result is A's."""
    config = (config or SelfPlayConfig()).for_arena(simulations)
    pairs = (games + 1) // 2
    seeds = [seed + i for i in range(pairs)]

    wins = draws = losses = 0
    total_a = total_b = 0
    played = 0
    # Half the games with A in seat 0, half with A in seat 1, on the same seeds.
    for a_seat in (0, 1):
        want = games - played if a_seat == 1 else games // 2 + games % 2
        if want <= 0:
            continue
        seat_evaluators = (
            [evaluator_a, evaluator_b] if a_seat == 0 else [evaluator_b, evaluator_a]
        )
        records = play_batch(
            seat_evaluators, want, config, seed=seed + a_seat, seeds=seeds[:want]
        )
        for record in records:
            score_a = record.scores[a_seat]
            score_b = record.scores[1 - a_seat]
            total_a += score_a
            total_b += score_b
            if record.winner is None:
                draws += 1
            elif record.winner == a_seat:
                wins += 1
            else:
                losses += 1
            played += 1

    n = max(played, 1)
    return MatchResult(played, wins, draws, losses, total_a / n, total_b / n)


def passes_gate(result: MatchResult, threshold: float = 0.55) -> bool:
    """Promote only on a clear win: point estimate over the bar *and* the
    confidence interval excluding parity, so noise cannot promote a tie."""
    return result.score >= threshold and result.interval[0] > 0.5
