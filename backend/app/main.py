"""FastAPI entrypoint: REST lifecycle + one WebSocket per game."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from engine import Action, IllegalAction, legal_actions

from .game_manager import GameManager
from .schemas import (
    ActionMessage,
    CreateGameRequest,
    CreateGameResponse,
    EveControlMessage,
    GameStateView,
    error_message,
    legal_actions_message,
    state_message,
)

log = logging.getLogger("quadro.app")
manager = GameManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await manager.shutdown()


app = FastAPI(title="Quadro", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev-only; the API carries no credentials
    allow_methods=["*"],
    allow_headers=["*"],
)


def _session_or_404(game_id: str):
    session = manager.get(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail="game not found")
    return session


@app.get("/api/levels")
async def get_levels() -> dict:
    """AI levels this deployment can actually serve.

    `azulzero` is only playable where trained weights are installed, so the
    setup screen asks rather than offering a level that would 503.
    """
    from ai import available_levels

    return {"levels": list(available_levels())}


@app.post("/api/games", response_model=CreateGameResponse)
async def create_game(req: CreateGameRequest) -> CreateGameResponse:
    from ai import available_levels

    playable = available_levels()
    for level in (req.ai0, req.ai1):
        if level is not None and level not in playable:
            raise HTTPException(
                status_code=503, detail=f"ai level '{level}' is not available on this server"
            )
    session = manager.create(mode=req.mode, ai0=req.ai0, ai1=req.ai1, seed=req.seed)
    manager.schedule_ai(session)  # eve, or pve where the AI has the first move
    return CreateGameResponse(game_id=session.game_id)


@app.get("/api/games/{game_id}", response_model=GameStateView)
async def get_game(game_id: str) -> GameStateView:
    return _session_or_404(game_id).view()


@app.get("/api/games/{game_id}/log")
async def get_log(game_id: str) -> dict:
    return _session_or_404(game_id).export_log()


@app.delete("/api/games/{game_id}")
async def delete_game(game_id: str) -> dict:
    if not manager.delete(game_id):
        raise HTTPException(status_code=404, detail="game not found")
    return {"ok": True}


@app.websocket("/ws/games/{game_id}")
async def game_socket(websocket: WebSocket, game_id: str) -> None:
    await websocket.accept()
    session = manager.get(game_id)
    if session is None:
        await websocket.send_json(error_message("GAME_OVER", "game not found"))
        await websocket.close()
        return

    session.sockets.add(websocket)
    await websocket.send_json(state_message(session.view()))
    await websocket.send_json(
        legal_actions_message([] if session.is_ai_turn() or session.game.is_over()
                              else legal_actions(session.game.state))
    )
    manager.schedule_ai(session)

    try:
        while True:
            raw = await websocket.receive_json()
            await _handle(session, websocket, raw)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("socket loop failed for game %s", game_id)
    finally:
        session.sockets.discard(websocket)


async def _handle(session, websocket: WebSocket, raw: object) -> None:
    if not isinstance(raw, dict) or "type" not in raw:
        await websocket.send_json(error_message("BAD_MESSAGE", "expected an object with a type"))
        return
    kind = raw.get("type")

    if kind == "resync":
        await websocket.send_json(state_message(session.view()))
        await websocket.send_json(
            legal_actions_message([] if session.is_ai_turn() or session.game.is_over()
                                  else legal_actions(session.game.state))
        )
        return

    if kind == "eve_control":
        try:
            msg = EveControlMessage.model_validate(raw)
        except ValidationError as exc:
            await websocket.send_json(error_message("BAD_MESSAGE", str(exc)))
            return
        await manager.eve_control(session, msg.command, msg.interval_ms)
        return

    if kind == "action":
        try:
            msg = ActionMessage.model_validate(raw)
            action = Action.from_dict({"source": msg.source, "color": msg.color, "dest": msg.dest})
        except (ValidationError, KeyError, TypeError) as exc:
            await websocket.send_json(error_message("BAD_MESSAGE", str(exc)))
            return
        try:
            await manager.submit_human_action(session, action)
        except PermissionError:
            await websocket.send_json(error_message("NOT_YOUR_TURN", "it is the AI's turn"))
            await session.push_legal_actions()
        except IllegalAction as exc:
            code = "GAME_OVER" if session.game.is_over() else "ILLEGAL_ACTION"
            await websocket.send_json(error_message(code, str(exc)))
            await session.push_legal_actions()
        return

    await websocket.send_json(error_message("BAD_MESSAGE", f"unknown message type {kind!r}"))
