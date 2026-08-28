"""Wire protocol — the single source of truth for `docs/protocol.md` and the
frontend's `types/game.ts`.

Colors serialize as names ("blue"), sources/dests/action ids stay integers as
the engine encodes them. Views are built from the engine's own `to_dict()` so
the protocol can never drift from the state it describes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from engine import Action, GameState

Mode = Literal["pvp", "pve", "eve"]
AiLevel = Literal["random", "greedy", "minimax", "mcts"]
ErrorCode = Literal["ILLEGAL_ACTION", "NOT_YOUR_TURN", "GAME_OVER", "BAD_MESSAGE"]


# ---------------------------------------------------------------- REST


class CreateGameRequest(BaseModel):
    mode: Mode = "pve"
    ai0: AiLevel | None = None
    ai1: AiLevel | None = "random"
    seed: int | None = None


class CreateGameResponse(BaseModel):
    game_id: str


class PlayerView(BaseModel):
    staging_colors: list[str | None]
    staging_counts: list[int]
    grid: list[list[bool]]
    penalty_tiles: list[str]
    penalty_overflow: int
    score: int
    has_first_token: bool


class ResultView(BaseModel):
    scores: list[int]
    winner: int | None
    draw: bool
    complete_rows: list[int]
    rounds: int


class GameStateView(BaseModel):
    game_id: str
    mode: Mode
    displays: list[dict[str, int]]
    center: dict[str, int]
    center_has_token: bool
    bag: dict[str, int]
    discard: dict[str, int]
    players: list[PlayerView]
    current: int
    first_player: int
    round_num: int
    phase: str
    agents: dict[str, AiLevel] = Field(default_factory=dict)
    result: ResultView | None = None


class ActionView(BaseModel):
    source: int
    color: str
    dest: int
    action_id: int


def state_view(game_id: str, mode: Mode, state: GameState, agents: dict[int, str],
               result: dict | None) -> GameStateView:
    d = state.to_dict(include_rng=False)
    return GameStateView(
        game_id=game_id,
        mode=mode,
        agents={str(k): v for k, v in agents.items()},
        result=ResultView(**result) if result else None,
        **d,
    )


def action_view(action: Action) -> ActionView:
    return ActionView(**action.to_dict())


# ---------------------------------------------------------------- WebSocket


class ActionMessage(BaseModel):
    type: Literal["action"]
    source: int
    color: str | int
    dest: int


class EveControlMessage(BaseModel):
    type: Literal["eve_control"]
    command: Literal["play", "pause", "step"]
    interval_ms: int | None = None


class ResyncMessage(BaseModel):
    type: Literal["resync"]


ClientMessage = ActionMessage | EveControlMessage | ResyncMessage


def state_message(view: GameStateView) -> dict:
    return {"type": "state", **view.model_dump()}


def events_message(events: list[dict]) -> dict:
    return {"type": "events", "events": events}


def legal_actions_message(actions: list[Action]) -> dict:
    return {
        "type": "legal_actions",
        "actions": [a.action_id for a in actions],
        "detail": [a.to_dict() for a in actions],
    }


def ai_thinking_message(player: int, level: str) -> dict:
    return {"type": "ai_thinking", "player": player, "level": level}


def error_message(code: ErrorCode, message: str) -> dict:
    return {"type": "error", "code": code, "message": message}
