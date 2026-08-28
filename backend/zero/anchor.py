"""Strength against the existing hand-written levels — the honest progress metric.

The loop's own numbers can all look healthy while the network is learning
nothing. Measured during development: self-play scores, falling policy loss and
a gate score climbing from 2% to 53% against a frozen opponent, at a point when
the trained network was worth **zero** against an external opponent — it beat
`random` 76.7% and the untrained network beat it 75.0%, so the entire result was
the search, not the weights.

Everything internal shares that blind spot, because everything internal is
measured against another copy of the same network. These anchors are not, so
they are what "is it working?" should actually be answered with.

    python -m zero.anchor runs/v1/azulzero.npz --levels random greedy --games 40
"""

from __future__ import annotations

import argparse
import os
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from engine import QuadroGame


@dataclass
class AnchorResult:
    level: str
    games: int
    wins: int
    draws: int
    losses: int
    mean_score: float
    mean_opponent_score: float

    @property
    def score(self) -> float:
        return (self.wins + 0.5 * self.draws) / self.games if self.games else 0.0

    def summary(self) -> str:
        return (
            f"vs {self.level}: {self.score:.1%} "
            f"({self.wins}W/{self.draws}D/{self.losses}L, "
            f"mean score {self.mean_score:.1f} vs {self.mean_opponent_score:.1f})"
        )


def _play(args: tuple) -> tuple[int | None, int, int]:
    """One game. Returns (winner_seat_of_zero, zero_score, opponent_score)."""
    weights, level, index, simulations, seed = args
    os.environ["AZULZERO_WEIGHTS"] = str(weights)
    from ai import make_agent
    from ai.azulzero_agent import AzulZeroAgent

    swapped = index % 2 == 1
    zero = AzulZeroAgent(seed=index, simulations=simulations, time_budget=0.0)
    other = make_agent(level, seed=index)
    seats = [other, zero] if swapped else [zero, other]

    game = QuadroGame(seed=seed)
    while not game.is_over():
        game.step(seats[game.current].choose(game.state, game.current))

    result = game.result()
    zero_seat = 1 if swapped else 0
    winner = None if result.draw else (0 if result.winner == zero_seat else 1)
    return winner, result.scores[zero_seat], result.scores[1 - zero_seat]


def evaluate(
    weights: Path,
    level: str,
    games: int = 40,
    simulations: int = 200,
    seed: int = 1000,
    workers: int = 1,
) -> AnchorResult:
    """Paired match against one classic level: each seed played from both seats."""
    jobs = [
        (Path(weights), level, i, simulations, seed + i // 2) for i in range(games)
    ]
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            outcomes = list(pool.map(_play, jobs, chunksize=2))
    else:
        outcomes = [_play(job) for job in jobs]

    wins = sum(1 for w, _, _ in outcomes if w == 0)
    draws = sum(1 for w, _, _ in outcomes if w is None)
    return AnchorResult(
        level=level,
        games=games,
        wins=wins,
        draws=draws,
        losses=games - wins - draws,
        mean_score=sum(s for _, s, _ in outcomes) / games,
        mean_opponent_score=sum(o for _, _, o in outcomes) / games,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AzulZero strength vs the classic levels")
    parser.add_argument("weights", type=Path)
    parser.add_argument("--levels", nargs="+", default=["random", "greedy", "minimax"])
    parser.add_argument("--games", type=int, default=40)
    parser.add_argument("--simulations", type=int, default=200)
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args(argv)

    for level in args.levels:
        result = evaluate(
            args.weights, level, args.games, args.simulations, workers=args.workers
        )
        print(result.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
