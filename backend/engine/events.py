"""Structured events emitted by the engine.

The engine never prints or logs. It returns events, and the CLI, the server and
the replay file all render the same stream. Every event is a plain dataclass
with `to_dict()` so it can go straight over the wire.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .constants import COLOR_NAMES


class Event:
    kind: str = "event"

    def to_dict(self) -> dict:
        d = asdict(self)  # type: ignore[call-overload]
        d["kind"] = self.kind
        if "color" in d and isinstance(d["color"], int) and d["color"] >= 0:
            d["color"] = COLOR_NAMES[d["color"]]
        return d


@dataclass
class Draft(Event):
    """A player took a color from a source and placed it."""

    player: int
    source: int
    color: int
    count: int
    dest: int
    placed: int  # tiles that landed on the staging row
    overflow: int  # tiles that landed on the penalty row
    to_discard: int  # tiles that fell off the end of a full penalty row
    took_first_token: bool
    kind: str = field(default="draft", init=False)


@dataclass
class TileScored(Event):
    """One tile moved onto the grid during settling."""

    player: int
    row: int
    col: int
    color: int
    points: int
    horizontal: int
    vertical: int
    kind: str = field(default="tile_scored", init=False)


@dataclass
class PenaltyApplied(Event):
    player: int
    tiles: int
    points: int  # negative or zero, before clamping at 0
    score_after: int
    kind: str = field(default="penalty", init=False)


@dataclass
class RoundEnd(Event):
    round_num: int
    scores: list[int]
    kind: str = field(default="round_end", init=False)


@dataclass
class RoundStart(Event):
    round_num: int
    first_player: int
    bag_refilled: bool
    short_displays: int  # displays that could not be filled to 4 (bag and discard empty)
    kind: str = field(default="round_start", init=False)


@dataclass
class BonusAwarded(Event):
    player: int
    rows: int
    columns: int
    colors: int
    points: int
    kind: str = field(default="bonus", init=False)


@dataclass
class GameEnd(Event):
    scores: list[int]
    winner: int | None
    draw: bool
    kind: str = field(default="game_end", init=False)
