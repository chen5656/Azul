"""Game lifecycle, AI scheduling and broadcast fan-out.

One `asyncio.Lock` per session serializes every mutation of that game, so a
human click racing an AI move can never interleave. AI search is CPU-bound and
runs in a thread pool: it must never block the event loop.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from engine import Action, IllegalAction, QuadroGame, legal_actions

from ai import Agent, make_agent
from ai.random_agent import RandomAgent
from .schemas import (
    AiLevel,
    GameStateView,
    Mode,
    ai_thinking_message,
    events_message,
    legal_actions_message,
    state_message,
    state_view,
)

log = logging.getLogger("quadro.manager")

SESSION_TTL = 3600.0  # seconds of inactivity before a session is reclaimed
DEFAULT_EVE_INTERVAL = 0.6


class Broadcaster:
    """Anything that can receive JSON. Real sockets and test doubles both fit."""

    async def send_json(self, payload: dict) -> None:  # pragma: no cover - interface
        raise NotImplementedError


@dataclass
class GameSession:
    game_id: str
    mode: Mode
    game: QuadroGame
    agents: dict[int, Agent] = field(default_factory=dict)
    levels: dict[int, str] = field(default_factory=dict)
    sockets: set[Any] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    log: list[dict] = field(default_factory=list)
    eve_playing: bool = False
    eve_interval: float = DEFAULT_EVE_INTERVAL
    last_touch: float = field(default_factory=time.monotonic)
    ai_task: asyncio.Task | None = None

    # ---- views -------------------------------------------------------

    def view(self) -> GameStateView:
        result = self.game.result().to_dict() if self.game.is_over() else None
        return state_view(self.game_id, self.mode, self.game.state, self.levels, result)

    def is_ai_turn(self) -> bool:
        return not self.game.is_over() and self.game.current in self.agents

    def export_log(self) -> dict:
        players = [
            {"kind": "ai", "level": self.levels[i]} if i in self.levels else {"kind": "human"}
            for i in range(2)
        ]
        record = self.game.to_log(players=players, mode=self.mode)
        record["events"] = self.log
        return record

    # ---- fan-out -----------------------------------------------------

    async def broadcast(self, payload: dict) -> None:
        for socket in list(self.sockets):
            try:
                await socket.send_json(payload)
            except Exception:  # a dead socket must not stop the others
                self.sockets.discard(socket)

    async def push_state(self, events: list[dict] | None = None) -> None:
        await self.broadcast(state_message(self.view()))
        if events:
            await self.broadcast(events_message(events))
        await self.push_legal_actions()

    async def push_legal_actions(self) -> None:
        """Legal actions are for the human at the wheel; AI turns get an empty set."""
        if self.game.is_over() or self.is_ai_turn():
            actions: list[Action] = []
        else:
            actions = legal_actions(self.game.state)
        await self.broadcast(legal_actions_message(actions))

    # ---- moves -------------------------------------------------------

    def _apply(self, action: Action) -> list[dict]:
        events = [e.to_dict() for e in self.game.step(action)]
        self.log.append({"action": action.to_dict(), "events": events})
        self.last_touch = time.monotonic()
        return events


class GameManager:
    def __init__(self, max_workers: int = 2):
        self.sessions: dict[str, GameSession] = {}
        self.max_workers = max_workers
        self.pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="quadro-ai")

    # ---- lifecycle ---------------------------------------------------

    def create(
        self,
        mode: Mode = "pve",
        ai0: AiLevel | None = None,
        ai1: AiLevel | None = "random",
        seed: int | None = None,
    ) -> GameSession:
        self.reap()
        game_id = uuid.uuid4().hex[:12]
        game = QuadroGame(seed=seed)
        levels: dict[int, str] = {}
        if mode == "pve":
            levels[1] = ai1 or "random"  # pve: the human is always player 0
        elif mode == "eve":
            levels[0] = ai0 or "random"
            levels[1] = ai1 or "random"
        agents = {i: make_agent(level, seed=game.seed + i) for i, level in levels.items()}
        session = GameSession(
            game_id=game_id, mode=mode, game=game, agents=agents, levels=levels
        )
        if mode == "eve":
            session.eve_playing = True
        self.sessions[game_id] = session
        return session

    def get(self, game_id: str) -> GameSession | None:
        session = self.sessions.get(game_id)
        if session:
            session.last_touch = time.monotonic()
        return session

    def delete(self, game_id: str) -> bool:
        session = self.sessions.pop(game_id, None)
        if session and session.ai_task:
            session.ai_task.cancel()
        return session is not None

    def reap(self, ttl: float = SESSION_TTL) -> int:
        """Drop sessions idle for longer than `ttl`."""
        now = time.monotonic()
        stale = [k for k, s in self.sessions.items() if now - s.last_touch > ttl]
        for k in stale:
            self.delete(k)
        return len(stale)

    # ---- play --------------------------------------------------------

    async def submit_human_action(self, session: GameSession, action: Action) -> list[dict]:
        """Apply a human action. Raises IllegalAction / PermissionError on refusal."""
        async with session.lock:
            if session.game.is_over():
                raise IllegalAction("the game is over")
            if session.is_ai_turn():
                raise PermissionError("it is the AI's turn")
            events = session._apply(action)
        await session.push_state(events)
        self.schedule_ai(session)
        return events

    def schedule_ai(self, session: GameSession) -> None:
        """Start the AI driver if it is an agent's turn and none is running."""
        if session.ai_task and not session.ai_task.done():
            return
        if not session.is_ai_turn():
            return
        if session.mode == "eve" and not session.eve_playing:
            return
        session.ai_task = asyncio.create_task(self._run_ai(session))

    async def _run_ai(self, session: GameSession, single_step: bool = False) -> None:
        """Play out consecutive AI turns, yielding to the loop between moves."""
        loop = asyncio.get_running_loop()
        while session.is_ai_turn():
            player = session.game.current
            agent = session.agents[player]
            await session.broadcast(ai_thinking_message(player, session.levels[player]))
            state = session.game.state.clone()
            try:
                action = await loop.run_in_executor(self.pool, agent.choose, state, player)
            except Exception:
                log.exception("agent %s crashed; falling back to a random legal move", agent)
                action = RandomAgent().choose(session.game.state, player)
            async with session.lock:
                if session.game.is_over() or session.game.current != player:
                    return  # state moved under us; abandon this move
                try:
                    events = session._apply(action)
                except IllegalAction:
                    log.exception("agent %s produced an illegal move; using a random one", agent)
                    events = session._apply(RandomAgent().choose(session.game.state, player))
            await session.push_state(events)
            if single_step:
                return
            if session.mode == "eve":
                if not session.eve_playing:
                    return
                await asyncio.sleep(session.eve_interval)

    async def eve_control(self, session: GameSession, command: str, interval_ms: int | None) -> None:
        if interval_ms is not None:
            session.eve_interval = max(0.0, interval_ms / 1000.0)
        if command == "pause":
            session.eve_playing = False
        elif command == "play":
            session.eve_playing = True
            self.schedule_ai(session)
        elif command == "step":
            session.eve_playing = False
            if session.is_ai_turn() and not (session.ai_task and not session.ai_task.done()):
                session.ai_task = asyncio.create_task(self._run_ai(session, single_step=True))

    async def shutdown(self) -> None:
        for game_id in list(self.sessions):
            self.delete(game_id)
        self.pool.shutdown(wait=False, cancel_futures=True)
        # A manager may outlive one app lifespan (tests, reloads): make it usable again.
        self.pool = ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="quadro-ai")
