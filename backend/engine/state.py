"""Core mutable state for Quadro, plus JSON-lossless serialization.

Design note (see docs/plans/01-engine.md §1.3): the bag holds per-color *counts*
rather than a shuffled sequence. The composition of the bag is public knowledge
anyway — only the draw order is random — so weighted random draws are equivalent
to drawing off a shuffled pile, and the state stays compact and easy to
serialize.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .constants import (
    CENTER,
    COLOR_BY_NAME,
    COLOR_NAMES,
    FIRST_TOKEN,
    GRID_SIZE,
    NUM_COLORS,
    NUM_DESTS,
    NUM_DISPLAYS,
    NUM_PLAYERS,
    NUM_ROWS,
    PENALTY_DEST,
    PENALTY_ROW_SIZE,
    PENALTY_TOTALS,
    STAGING_CAPACITY,
    TILES_PER_COLOR,
)

DRAFTING = "drafting"
GAME_OVER = "game_over"


@dataclass(frozen=True, slots=True)
class Action:
    source: int  # 0..4 display, 5 center
    color: int  # 0..4
    dest: int  # 0..4 staging row, 5 penalty row

    @property
    def action_id(self) -> int:
        return (self.source * NUM_COLORS + self.color) * NUM_DESTS + self.dest

    @staticmethod
    def from_id(action_id: int) -> "Action":
        dest = action_id % NUM_DESTS
        rest = action_id // NUM_DESTS
        return Action(rest // NUM_COLORS, rest % NUM_COLORS, dest)

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "color": COLOR_NAMES[self.color],
            "dest": self.dest,
            "action_id": self.action_id,
        }

    @staticmethod
    def from_dict(d: dict) -> "Action":
        color = d["color"]
        if isinstance(color, str):
            color = COLOR_BY_NAME[color]
        return Action(d["source"], color, d["dest"])

    def describe(self) -> str:
        src = "center" if self.source == CENTER else f"D{self.source}"
        dst = "penalty" if self.dest == PENALTY_DEST else f"row {self.dest + 1}"
        return f"{src} {COLOR_NAMES[self.color]} -> {dst}"


@dataclass(slots=True)
class PlayerBoard:
    staging_colors: list[int] = field(default_factory=lambda: [-1] * NUM_ROWS)
    staging_counts: list[int] = field(default_factory=lambda: [0] * NUM_ROWS)
    grid: list[list[bool]] = field(
        default_factory=lambda: [[False] * GRID_SIZE for _ in range(NUM_ROWS)]
    )
    penalty_tiles: list[int] = field(default_factory=list)
    penalty_overflow: int = 0
    score: int = 0
    has_first_token: bool = False

    def clone(self) -> "PlayerBoard":
        return PlayerBoard(
            staging_colors=self.staging_colors[:],
            staging_counts=self.staging_counts[:],
            grid=[row[:] for row in self.grid],
            penalty_tiles=self.penalty_tiles[:],
            penalty_overflow=self.penalty_overflow,
            score=self.score,
            has_first_token=self.has_first_token,
        )

    def penalty_total(self) -> int:
        """Points the penalty row would subtract right now (negative or zero)."""
        return PENALTY_TOTALS[len(self.penalty_tiles)]

    def complete_rows(self) -> int:
        return sum(1 for row in self.grid if all(row))

    def complete_columns(self) -> int:
        return sum(1 for c in range(GRID_SIZE) if all(self.grid[r][c] for r in range(NUM_ROWS)))

    def complete_colors(self) -> int:
        from .constants import GRID_COL

        return sum(
            1
            for color in range(NUM_COLORS)
            if all(self.grid[r][GRID_COL[r][color]] for r in range(NUM_ROWS))
        )

    def has_complete_row(self) -> bool:
        return any(all(row) for row in self.grid)

    def to_dict(self) -> dict:
        return {
            "staging_colors": [
                None if c < 0 else COLOR_NAMES[c] for c in self.staging_colors
            ],
            "staging_counts": self.staging_counts[:],
            "grid": [row[:] for row in self.grid],
            "penalty_tiles": [
                "first_token" if t == FIRST_TOKEN else COLOR_NAMES[t]
                for t in self.penalty_tiles
            ],
            "penalty_overflow": self.penalty_overflow,
            "score": self.score,
            "has_first_token": self.has_first_token,
        }

    @staticmethod
    def from_dict(d: dict) -> "PlayerBoard":
        return PlayerBoard(
            staging_colors=[-1 if c is None else COLOR_BY_NAME[c] for c in d["staging_colors"]],
            staging_counts=list(d["staging_counts"]),
            grid=[[bool(v) for v in row] for row in d["grid"]],
            penalty_tiles=[
                FIRST_TOKEN if t == "first_token" else COLOR_BY_NAME[t]
                for t in d["penalty_tiles"]
            ],
            penalty_overflow=d["penalty_overflow"],
            score=d["score"],
            has_first_token=d["has_first_token"],
        )


@dataclass(slots=True)
class GameState:
    displays: list[list[int]] = field(
        default_factory=lambda: [[0] * NUM_COLORS for _ in range(NUM_DISPLAYS)]
    )
    center: list[int] = field(default_factory=lambda: [0] * NUM_COLORS)
    center_has_token: bool = True
    bag: list[int] = field(default_factory=lambda: [TILES_PER_COLOR] * NUM_COLORS)
    discard: list[int] = field(default_factory=lambda: [0] * NUM_COLORS)
    players: list[PlayerBoard] = field(
        default_factory=lambda: [PlayerBoard() for _ in range(NUM_PLAYERS)]
    )
    current: int = 0
    first_player: int = 0  # who started this round; fallback if nobody takes the token
    round_num: int = 1
    phase: str = DRAFTING
    rng: random.Random = field(default_factory=random.Random)

    # ---- convenience -------------------------------------------------

    def source_counts(self, source: int) -> list[int]:
        return self.center if source == CENTER else self.displays[source]

    def drafting_done(self) -> bool:
        """True when no tiles remain to be taken (the first token does not count)."""
        if any(self.center):
            return False
        return not any(any(d) for d in self.displays)

    def tile_census(self) -> list[int]:
        """Per-color count of every tile in the game; used by invariant checks."""
        total = [0] * NUM_COLORS
        for color in range(NUM_COLORS):
            total[color] += self.bag[color] + self.discard[color] + self.center[color]
            for d in self.displays:
                total[color] += d[color]
        for board in self.players:
            for row in range(NUM_ROWS):
                if board.staging_colors[row] >= 0:
                    total[board.staging_colors[row]] += board.staging_counts[row]
            for tile in board.penalty_tiles:
                if tile != FIRST_TOKEN:
                    total[tile] += 1
            for r in range(NUM_ROWS):
                for c in range(GRID_SIZE):
                    if board.grid[r][c]:
                        from .constants import GRID_COLOR

                        total[GRID_COLOR[r][c]] += 1
        return total

    def clone(self) -> "GameState":
        copy = GameState(
            displays=[d[:] for d in self.displays],
            center=self.center[:],
            center_has_token=self.center_has_token,
            bag=self.bag[:],
            discard=self.discard[:],
            players=[p.clone() for p in self.players],
            current=self.current,
            first_player=self.first_player,
            round_num=self.round_num,
            phase=self.phase,
            rng=random.Random(),
        )
        copy.rng.setstate(self.rng.getstate())
        return copy

    # ---- serialization -----------------------------------------------

    def to_dict(self, include_rng: bool = True) -> dict:
        d = {
            "displays": [
                {COLOR_NAMES[c]: n for c, n in enumerate(display) if n} for display in self.displays
            ],
            "center": {COLOR_NAMES[c]: n for c, n in enumerate(self.center) if n},
            "center_has_token": self.center_has_token,
            "bag": {COLOR_NAMES[c]: n for c, n in enumerate(self.bag)},
            "discard": {COLOR_NAMES[c]: n for c, n in enumerate(self.discard)},
            "players": [p.to_dict() for p in self.players],
            "current": self.current,
            "first_player": self.first_player,
            "round_num": self.round_num,
            "phase": self.phase,
        }
        if include_rng:
            state = self.rng.getstate()
            d["rng"] = [state[0], list(state[1]), state[2]]
        return d

    @staticmethod
    def from_dict(d: dict) -> "GameState":
        def counts(mapping: dict) -> list[int]:
            out = [0] * NUM_COLORS
            for name, n in mapping.items():
                out[COLOR_BY_NAME[name]] = n
            return out

        state = GameState(
            displays=[counts(x) for x in d["displays"]],
            center=counts(d["center"]),
            center_has_token=d["center_has_token"],
            bag=counts(d["bag"]),
            discard=counts(d["discard"]),
            players=[PlayerBoard.from_dict(p) for p in d["players"]],
            current=d["current"],
            first_player=d.get("first_player", 0),
            round_num=d["round_num"],
            phase=d["phase"],
            rng=random.Random(),
        )
        if "rng" in d:
            version, internal, gauss = d["rng"]
            state.rng.setstate((version, tuple(internal), gauss))
        return state
