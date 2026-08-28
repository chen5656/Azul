"""The training loop. This is the script to run on the training machine.

    python -m zero.loop --run runs/v1 --generations 200

One generation is: play self-play games with the *latest* weights, train on the
replay window, then check the result against the current best.

Self-play deliberately uses `latest`, not `best`. Gating what self-play plays
with deadlocks the bootstrap: generation 1 has no value signal, so its visit
counts are uniform over the legal moves, so its policy target teaches nothing
but which actions tend to be legal — a policy that loses to an untrained network
and never passes a gate. With self-play always on `latest`, the value head still
learns from real game outcomes, the next generation's search finally has
something to discriminate with, and the policy recovers. `best` is kept purely
as the deployment pointer, so a regression is never exported.

State is written to `--run` after every generation, so the loop is safe to kill
and resume — which matters when a run is measured in days.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import torch

from .anchor import evaluate as anchor_evaluate
from .arena import duel, passes_gate
from .export import export
from .mcts import SearchConfig
from .model import AzulZeroNet, ModelConfig, load_checkpoint, save_checkpoint
from .replay import ReplayBuffer
from .selfplay import SelfPlayConfig, play_games
from .train import TorchEvaluator, TrainConfig, pick_device, train_epoch


@dataclass
class LoopConfig:
    generations: int = 200
    games_per_generation: int = 250
    buffer_capacity: int = 250_000
    min_buffer: int = 20_000  # do not train on a nearly empty window
    gate_games: int = 200
    gate_threshold: float = 0.55
    gate_simulations: int = 200
    # Strength against the hand-written levels. Everything else in the loop is
    # measured against another copy of this same network, so only these numbers
    # can tell you the weights are worth anything (see zero/anchor.py).
    anchor_every: int = 10
    anchor_games: int = 40
    anchor_levels: tuple[str, ...] = ("random", "greedy")
    selfplay: SelfPlayConfig = field(default_factory=SelfPlayConfig)
    train: TrainConfig = field(default_factory=TrainConfig)
    model: ModelConfig = field(default_factory=ModelConfig)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


class Run:
    """Everything on disk for one training run."""

    def __init__(self, directory: Path, config: LoopConfig):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.config = config
        self.best_path = self.dir / "best.pt"
        self.buffer_path = self.dir / "replay.npz"
        self.state_path = self.dir / "state.json"
        self.log_path = self.dir / "log.jsonl"

    @property
    def latest_path(self) -> Path:
        return self.dir / "latest.pt"

    def load_state(self) -> dict:
        if self.state_path.exists():
            return json.loads(self.state_path.read_text())
        return {"generation": 0, "promotions": 0, "games": 0, "failed_gates": 0}

    def save_state(self, state: dict) -> None:
        self.state_path.write_text(json.dumps(state, indent=2))

    def log(self, entry: dict) -> None:
        with self.log_path.open("a") as fh:
            fh.write(json.dumps(entry) + "\n")


def _load_or_init(run: Run) -> tuple[AzulZeroNet, AzulZeroNet]:
    """Return (latest, best), seeding both from one zero-init net on a fresh run."""
    if not run.latest_path.exists():
        net = AzulZeroNet(run.config.model)
        save_checkpoint(run.latest_path, net, {"generation": 0, "note": "zero init"})
        save_checkpoint(run.best_path, net, {"generation": 0, "note": "zero init"})
    latest, _ = load_checkpoint(run.latest_path)
    best, _ = load_checkpoint(run.best_path)
    return latest, best


def run_loop(run: Run, device: torch.device, seed: int = 0) -> None:
    config = run.config
    state = run.load_state()
    rng = np.random.default_rng(seed + state["generation"])

    latest, best = _load_or_init(run)
    buffer = (
        ReplayBuffer.load(run.buffer_path, config.buffer_capacity)
        if run.buffer_path.exists()
        else ReplayBuffer(config.buffer_capacity)
    )
    print(f"run {run.dir} | generation {state['generation']} | buffer {len(buffer)}")

    for _ in range(config.generations):
        generation = state["generation"] + 1
        started = time.perf_counter()

        # --- self-play with the latest weights ---------------------------
        records = play_games(
            TorchEvaluator(latest, device),
            config.games_per_generation,
            config.selfplay,
            seed=seed * 7919 + generation,
        )
        added = sum(len(r.samples) for r in records)
        with_policy = sum(
            1 for r in records for s in r.samples if s.policy_weight > 0
        )
        for record in records:
            buffer.add(record.samples)
        selfplay_seconds = time.perf_counter() - started
        mean_margin = float(
            np.mean([r.scores[0] - r.scores[1] for r in records])
        ) if records else 0.0
        mean_score = float(np.mean([max(r.scores) for r in records])) if records else 0.0

        entry = {
            "generation": generation,
            "games": len(records),
            "samples_added": added,
            "policy_targets": with_policy,
            "buffer": len(buffer),
            "selfplay_seconds": round(selfplay_seconds, 1),
            "mean_winning_score": round(mean_score, 1),
            "mean_seat_margin": round(mean_margin, 2),
        }
        state["games"] += len(records)

        # --- train a candidate -------------------------------------------
        if len(buffer) < config.min_buffer:
            print(f"gen {generation}: buffer {len(buffer)} < {config.min_buffer}, collecting")
            entry["skipped"] = "buffer too small"
            run.log(entry)
            state["generation"] = generation
            run.save_state(state)
            buffer.save(run.buffer_path)
            continue

        # Training continues from `latest`, so progress accumulates whether or
        # not the arena promotes this generation.
        stats = train_epoch(latest, buffer, config.train, device, rng)
        save_checkpoint(run.latest_path, latest, {"generation": generation})
        entry.update(
            {
                "loss": round(stats.loss, 4),
                "policy_loss": round(stats.policy_loss, 4),
                "value_loss": round(stats.value_loss, 4),
            }
        )

        # --- gate ---------------------------------------------------------
        result = duel(
            TorchEvaluator(latest, device),
            TorchEvaluator(best, device),
            games=config.gate_games,
            config=config.selfplay,
            simulations=config.gate_simulations,
            seed=99991 + generation,
        )
        promoted = passes_gate(result, config.gate_threshold)
        entry.update(
            {
                "gate_score": round(result.score, 4),
                "gate_low": round(result.interval[0], 4),
                "promoted": promoted,
                "gate": result.summary(f"gen{generation}", "best"),
            }
        )

        if promoted:
            best.load_state_dict(latest.state_dict())
            save_checkpoint(run.best_path, best, {"generation": generation})
            export(run.best_path, run.dir / "azulzero.npz")
            state["promotions"] += 1
            state["failed_gates"] = 0
        else:
            state["failed_gates"] += 1

        if config.anchor_every and generation % config.anchor_every == 0:
            weights = run.dir / "anchor.npz"
            save_checkpoint(run.dir / "anchor.pt", latest, {"generation": generation})
            export(run.dir / "anchor.pt", weights)
            anchors = {}
            for level in config.anchor_levels:
                anchor = anchor_evaluate(
                    weights, level, config.anchor_games, config.gate_simulations
                )
                anchors[level] = round(anchor.score, 4)
                print(f"  anchor {anchor.summary()}")
            entry["anchors"] = anchors

        entry["total_seconds"] = round(time.perf_counter() - started, 1)
        entry["failed_gates"] = state["failed_gates"]
        run.log(entry)
        state["generation"] = generation
        run.save_state(state)
        buffer.save(run.buffer_path)

        print(
            f"gen {generation}: {len(records)} games, {stats.summary()}, "
            f"{result.summary(f'gen{generation}', 'best')} "
            f"-> {'PROMOTED' if promoted else 'rejected'} "
            f"[{entry['total_seconds']}s]"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AzulZero training loop")
    parser.add_argument("--run", type=Path, default=Path("runs/v1"))
    parser.add_argument("--generations", type=int, default=200)
    parser.add_argument("--games", type=int, default=250, help="self-play games per generation")
    parser.add_argument("--simulations", type=int, default=400)
    parser.add_argument("--in-flight", type=int, default=32, help="games batched per net call")
    parser.add_argument("--steps", type=int, default=1000, help="training steps per generation")
    parser.add_argument("--batch", type=int, default=512)
    parser.add_argument("--gate-games", type=int, default=200)
    parser.add_argument("--gate-simulations", type=int, default=200)
    parser.add_argument(
        "--anchor-every", type=int, default=10,
        help="measure strength against the classic levels every N generations (0 disables)",
    )
    parser.add_argument("--anchor-games", type=int, default=40)
    parser.add_argument("--capacity", type=int, default=250_000)
    parser.add_argument(
        "--min-buffer", type=int, default=20_000,
        help="collect this many positions before the first training step",
    )
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--blocks", type=int, default=4)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "mps", "cuda"])
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    config = LoopConfig(
        generations=args.generations,
        games_per_generation=args.games,
        buffer_capacity=args.capacity,
        min_buffer=args.min_buffer,
        gate_games=args.gate_games,
        gate_simulations=args.gate_simulations,
        anchor_every=args.anchor_every,
        anchor_games=args.anchor_games,
        selfplay=SelfPlayConfig(
            games_in_flight=args.in_flight,
            search=SearchConfig(simulations=args.simulations),
        ),
        train=TrainConfig(steps=args.steps, batch_size=args.batch),
        model=ModelConfig(width=args.width, blocks=args.blocks),
    )
    device = pick_device(args.device)
    print(f"device: {device}")
    run = Run(args.run, config)
    (run.dir / "config.json").write_text(json.dumps(config.to_dict(), indent=2))
    run_loop(run, device, seed=args.seed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
