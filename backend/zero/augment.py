"""The one symmetry Quadro has: the displays are interchangeable.

Which physical display a group of tiles sits on carries no information — only
its contents matter. So permuting the five displays (and the matching action
ids) yields a different sample of the same position, and 5! = 120 relabelings
are all equally valid training data.

Color permutation is *not* a symmetry here: the wall's color layout is fixed, so
recoloring the table without also rotating the wall changes the position.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from engine.constants import NUM_ACTIONS, NUM_COLORS, NUM_DESTS, NUM_DISPLAYS

from .encode import TABLE_OFF


@lru_cache(maxsize=None)
def _permutation_table(perm: tuple[int, ...]) -> np.ndarray:
    """action_id -> action_id under a display relabeling."""
    table = np.arange(NUM_ACTIONS, dtype=np.int64)
    for source in range(NUM_DISPLAYS):
        for color in range(NUM_COLORS):
            for dest in range(NUM_DESTS):
                src_id = (source * NUM_COLORS + color) * NUM_DESTS + dest
                dst_id = (perm[source] * NUM_COLORS + color) * NUM_DESTS + dest
                table[src_id] = dst_id
    return table


def random_permutation(rng: np.random.Generator) -> tuple[int, ...]:
    return tuple(int(x) for x in rng.permutation(NUM_DISPLAYS))


def apply_permutation(
    features: np.ndarray, policy: np.ndarray, perm: tuple[int, ...]
) -> tuple[np.ndarray, np.ndarray]:
    """Relabel displays in one (features, policy) pair. Both are copied."""
    f = features.copy()
    block = f[TABLE_OFF : TABLE_OFF + NUM_DISPLAYS * NUM_COLORS].reshape(
        NUM_DISPLAYS, NUM_COLORS
    )
    permuted = np.empty_like(block)
    for source in range(NUM_DISPLAYS):
        permuted[perm[source]] = block[source]
    f[TABLE_OFF : TABLE_OFF + NUM_DISPLAYS * NUM_COLORS] = permuted.reshape(-1)

    p = np.zeros_like(policy)
    p[_permutation_table(perm)] = policy
    return f, p
