"""AzulZero — AlphaZero-style self-play learner for Quadro.

See docs/plans_alphaZero/README.md. The package is optional: everything that
needs PyTorch imports it lazily so `import zero.encode` works with numpy alone.
"""

from .encode import NUM_FEATURES, encode_state

__all__ = ["NUM_FEATURES", "encode_state"]
