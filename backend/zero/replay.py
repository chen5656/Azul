"""Sliding-window replay buffer.

A ring buffer over preallocated arrays: self-play appends, training samples
uniformly, and the oldest positions fall out as new generations arrive. Keeping
the window finite is what stops the network from being anchored to the play of
early, weak generations.

Memory at the default capacity is about `capacity * (205 + 180) * 4` bytes —
roughly 380MB at 250k positions. Raise `capacity` if the machine has room; it is
the one knob that trades RAM for training stability.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from engine.constants import NUM_ACTIONS

from .encode import NUM_FEATURES


class ReplayBuffer:
    def __init__(self, capacity: int = 250_000):
        self.capacity = capacity
        self.features = np.zeros((capacity, NUM_FEATURES), dtype=np.float32)
        self.policy = np.zeros((capacity, NUM_ACTIONS), dtype=np.float32)
        self.policy_weight = np.zeros(capacity, dtype=np.float32)
        self.value = np.zeros(capacity, dtype=np.float32)
        self.size = 0
        self.cursor = 0

    def __len__(self) -> int:
        return self.size

    def add(self, samples) -> None:
        for sample in samples:
            i = self.cursor
            self.features[i] = sample.features
            self.policy[i] = sample.policy
            self.policy_weight[i] = sample.policy_weight
            self.value[i] = sample.value
            self.cursor = (i + 1) % self.capacity
            self.size = min(self.size + 1, self.capacity)

    def add_records(self, records) -> int:
        total = 0
        for record in records:
            self.add(record.samples)
            total += len(record.samples)
        return total

    def sample(self, batch_size: int, rng: np.random.Generator):
        idx = rng.integers(0, self.size, size=batch_size)
        return (
            self.features[idx],
            self.policy[idx],
            self.policy_weight[idx],
            self.value[idx],
        )

    # ---- persistence --------------------------------------------------

    def save(self, path: str | Path) -> None:
        """Write the live window only, so a reload is not padded with zeros."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        order = self._order()
        np.savez_compressed(
            path,
            features=self.features[order],
            policy=self.policy[order],
            policy_weight=self.policy_weight[order],
            value=self.value[order],
            capacity=np.array(self.capacity),
        )

    def _order(self) -> np.ndarray:
        """Indices oldest-first, so a reload keeps the recency ordering."""
        if self.size < self.capacity:
            return np.arange(self.size)
        return np.concatenate(
            [np.arange(self.cursor, self.capacity), np.arange(0, self.cursor)]
        )

    @classmethod
    def load(cls, path: str | Path, capacity: int | None = None) -> "ReplayBuffer":
        blob = np.load(path)
        buffer = cls(capacity or int(blob["capacity"]))
        n = min(len(blob["value"]), buffer.capacity)
        chunk = slice(len(blob["value"]) - n, None)  # keep the newest if it shrank
        buffer.features[:n] = blob["features"][chunk]
        buffer.policy[:n] = blob["policy"][chunk]
        buffer.policy_weight[:n] = blob["policy_weight"][chunk]
        buffer.value[:n] = blob["value"][chunk]
        buffer.size = n
        buffer.cursor = n % buffer.capacity
        return buffer
