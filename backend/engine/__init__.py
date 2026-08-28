"""Quadro rules engine — pure Python, no third-party dependencies."""

from .constants import COLOR_NAMES, GRID_COL, GRID_COLOR, NUM_COLORS
from .events import (
    BonusAwarded,
    Draft,
    Event,
    GameEnd,
    PenaltyApplied,
    RoundEnd,
    RoundStart,
    TileScored,
)
from .game import GameResult, IllegalAction, QuadroGame
from .rules import (
    Preview,
    Undo,
    apply_action,
    can_stage,
    is_legal,
    legal_actions,
    preview,
    score_placement,
    settle_round,
    undo_action,
)
from .state import GAME_OVER, Action, GameState, PlayerBoard

__all__ = [
    "Action",
    "BonusAwarded",
    "COLOR_NAMES",
    "Draft",
    "Event",
    "GAME_OVER",
    "GRID_COL",
    "GRID_COLOR",
    "GameEnd",
    "GameResult",
    "GameState",
    "IllegalAction",
    "NUM_COLORS",
    "PenaltyApplied",
    "PlayerBoard",
    "Preview",
    "QuadroGame",
    "RoundEnd",
    "RoundStart",
    "TileScored",
    "Undo",
    "apply_action",
    "can_stage",
    "is_legal",
    "legal_actions",
    "preview",
    "score_placement",
    "settle_round",
    "undo_action",
]
