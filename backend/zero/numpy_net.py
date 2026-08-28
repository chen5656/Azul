"""Inference without PyTorch.

The deployed agent runs inside the FastAPI server and inside `scripts.benchmark`,
neither of which should pull a ~2GB training dependency. The network is small
enough that a hand-written numpy forward pass is comfortably fast (tens of
microseconds per position), so training exports an `.npz` of the weights and
everything downstream reads that.

`zero.export` writes the archive; `tests/test_zero_net.py` pins the numpy output
to the PyTorch output so the two can never drift.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from engine.constants import NUM_ACTIONS

from .encode import NUM_FEATURES, PLAYER_OFF, PLAYER_SIZE


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0, out=x)


def _layer_norm(x: np.ndarray, weight: np.ndarray, bias: np.ndarray) -> np.ndarray:
    mean = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return (x - mean) / np.sqrt(var + 1e-5) * weight + bias


class NumpyNet:
    """Forward pass of `zero.model.AzulZeroNet` over float32 numpy arrays."""

    def __init__(self, weights: dict[str, np.ndarray], blocks: int):
        self.w = {k: np.ascontiguousarray(v, dtype=np.float32) for k, v in weights.items()}
        self.blocks = blocks
        self.features = self.w["stem.w"].shape[1]
        self.actions = self.w["policy.2.w"].shape[0]
        if self.features != NUM_FEATURES or self.actions != NUM_ACTIONS:
            raise ValueError(
                f"weight shapes disagree with the engine: features "
                f"{self.features}!={NUM_FEATURES} or actions {self.actions}!={NUM_ACTIONS}"
            )

    @classmethod
    def load(cls, path: str | Path) -> "NumpyNet":
        blob = np.load(path)
        weights = {k: blob[k] for k in blob.files if k != "meta_blocks"}
        return cls(weights, int(blob["meta_blocks"]))

    def _linear(self, x: np.ndarray, prefix: str) -> np.ndarray:
        return x @ self.w[prefix + ".w"].T + self.w[prefix + ".b"]

    def infer(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """`x` is (N, F) -> (policy logits (N, 180), value (N,) in [-1, 1])."""
        h = _relu(_layer_norm(self._linear(x, "stem"), self.w["stem.ln.w"], self.w["stem.ln.b"]))
        for i in range(self.blocks):
            b = f"block{i}"
            t = _relu(
                _layer_norm(
                    self._linear(h, b + ".fc1"), self.w[b + ".ln1.w"], self.w[b + ".ln1.b"]
                )
            )
            t = _layer_norm(
                self._linear(t, b + ".fc2"), self.w[b + ".ln2.w"], self.w[b + ".ln2.b"]
            )
            h = _relu(h + t)
        p = self._linear(_relu(self._linear(h, "policy.0")), "policy.2")
        v = np.tanh(self._linear(_relu(self._linear(h, "value.0")), "value.2")).reshape(-1)
        return p, v

    # ---- Evaluator protocol used by zero.mcts -------------------------

    def infer_one(self, features: np.ndarray) -> tuple[np.ndarray, float]:
        logits, value = self.infer(features.reshape(1, -1))
        return logits[0], float(value[0])


class UniformNet:
    """Zero-knowledge evaluator: flat policy, value 0.

    Useful as a control — a search driven by this is pure PUCT with no learned
    signal, which is the baseline every trained checkpoint must beat.
    """

    def infer(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        n = x.shape[0]
        return np.zeros((n, NUM_ACTIONS), dtype=np.float32), np.zeros(n, dtype=np.float32)

    def infer_one(self, features: np.ndarray) -> tuple[np.ndarray, float]:
        return np.zeros(NUM_ACTIONS, dtype=np.float32), 0.0


class ScoreDiffNet:
    """A hand-computed stand-in for a trained value head: "am I ahead?".

    It reads both scores straight out of the feature vector, so it is a real
    value function with no learning involved. That makes it the sharpest test of
    the perspective conventions available: a search driven by it must beat
    `UniformNet` from *either* seat, and any flipped sign turns it into an agent
    that works to lose. See `tests/test_zero.py`.
    """

    MY_SCORE = PLAYER_OFF + PLAYER_SIZE - 1
    THEIR_SCORE = PLAYER_OFF + 2 * PLAYER_SIZE - 1

    def __init__(self, scale: float = 0.2):
        self.scale = scale

    def infer(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        margin = (x[:, self.MY_SCORE] - x[:, self.THEIR_SCORE]) / self.scale
        return (
            np.zeros((x.shape[0], NUM_ACTIONS), dtype=np.float32),
            np.tanh(margin).astype(np.float32),
        )

    def infer_one(self, features: np.ndarray) -> tuple[np.ndarray, float]:
        logits, value = self.infer(features.reshape(1, -1))
        return logits[0], float(value[0])
