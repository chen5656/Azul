"""Export a trained checkpoint to the numpy `.npz` the deployed agent loads.

    python -m zero.export runs/v1/best.pt zero/weights/azulzero-v1.npz
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from .model import AzulZeroNet, load_checkpoint


def to_numpy_weights(net: AzulZeroNet) -> dict[str, np.ndarray]:
    """Flatten the torch module into the flat names `NumpyNet` expects."""
    sd = {k: v.detach().cpu().numpy().astype(np.float32) for k, v in net.state_dict().items()}
    out = {
        "stem.w": sd["stem.0.weight"],
        "stem.b": sd["stem.0.bias"],
        "stem.ln.w": sd["stem.1.weight"],
        "stem.ln.b": sd["stem.1.bias"],
        "policy.0.w": sd["policy_head.0.weight"],
        "policy.0.b": sd["policy_head.0.bias"],
        "policy.2.w": sd["policy_head.2.weight"],
        "policy.2.b": sd["policy_head.2.bias"],
        "value.0.w": sd["value_head.0.weight"],
        "value.0.b": sd["value_head.0.bias"],
        "value.2.w": sd["value_head.2.weight"],
        "value.2.b": sd["value_head.2.bias"],
    }
    for i in range(net.config.blocks):
        out[f"block{i}.fc1.w"] = sd[f"blocks.{i}.fc1.weight"]
        out[f"block{i}.fc1.b"] = sd[f"blocks.{i}.fc1.bias"]
        out[f"block{i}.fc2.w"] = sd[f"blocks.{i}.fc2.weight"]
        out[f"block{i}.fc2.b"] = sd[f"blocks.{i}.fc2.bias"]
        out[f"block{i}.ln1.w"] = sd[f"blocks.{i}.norm1.weight"]
        out[f"block{i}.ln1.b"] = sd[f"blocks.{i}.norm1.bias"]
        out[f"block{i}.ln2.w"] = sd[f"blocks.{i}.norm2.weight"]
        out[f"block{i}.ln2.b"] = sd[f"blocks.{i}.norm2.bias"]
    out["meta_blocks"] = np.array(net.config.blocks, dtype=np.int32)
    return out


def export(checkpoint: Path, destination: Path) -> Path:
    net, _ = load_checkpoint(checkpoint)
    destination.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(destination, **to_numpy_weights(net))
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="export a checkpoint for numpy inference")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    path = export(args.checkpoint, args.destination)
    print(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
