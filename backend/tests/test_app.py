"""End-to-end tests for the P2 slice: REST, WebSocket, AI scheduling, replay."""

from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient

from app.main import app, manager
from engine import COLOR_NAMES, Action, QuadroGame, legal_actions


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    manager.sessions.clear()


def create(client, **body) -> str:
    r = client.post("/api/games", json={"mode": "pve", "ai1": "random", **body})
    assert r.status_code == 200
    return r.json()["game_id"]


def drain_until(ws, kind, limit=40):
    """Read messages until one of `kind` arrives; return (it, everything seen)."""
    seen = []
    for _ in range(limit):
        msg = ws.receive_json()
        seen.append(msg)
        if msg["type"] == kind:
            return msg, seen
    raise AssertionError(f"never saw a {kind} message; got {[m['type'] for m in seen]}")


def test_create_and_snapshot(client):
    game_id = create(client, seed=7)
    snap = client.get(f"/api/games/{game_id}").json()
    assert snap["mode"] == "pve"
    assert snap["agents"] == {"1": "random"}
    assert len(snap["displays"]) == 5
    # 20 tiles are dealt; the AI may already have drafted if it holds the first move.
    assert 16 <= sum(sum(d.values()) for d in snap["displays"]) <= 20
    assert snap["round_num"] == 1
    assert client.get("/api/games/nope").status_code == 404


def test_delete_game(client):
    game_id = create(client)
    assert client.delete(f"/api/games/{game_id}").status_code == 200
    assert client.get(f"/api/games/{game_id}").status_code == 404
    assert client.delete(f"/api/games/{game_id}").status_code == 404


def test_play_a_full_pve_game(client):
    """A scripted human plays random legal moves until the game ends."""
    game_id = create(client, seed=11)
    rng = random.Random(5)
    with client.websocket_connect(f"/ws/games/{game_id}") as ws:
        state, _ = drain_until(ws, "state")
        for _ in range(400):
            legal, seen = drain_until(ws, "legal_actions")
            state = next((m for m in reversed(seen) if m["type"] == "state"), state)
            if state.get("result") is not None:
                break
            if not legal["actions"]:
                continue
            choice = rng.choice(legal["detail"])
            ws.send_json({"type": "action", **{k: choice[k] for k in ("source", "color", "dest")}})
        else:
            raise AssertionError("game did not finish within 400 exchanges")

    session = manager.get(game_id)
    assert session.game.is_over()
    result = session.game.result()
    assert result.winner is not None or result.draw
    assert all(s >= 0 for s in result.scores)


def test_illegal_action_is_rejected_without_changing_state(client):
    game_id = create(client, seed=3)
    session = manager.get(game_id)
    with client.websocket_connect(f"/ws/games/{game_id}") as ws:
        drain_until(ws, "legal_actions")
        legal_ids = {a.action_id for a in legal_actions(session.game.state)}
        illegal = next(
            Action.from_id(i) for i in range(180) if i not in legal_ids
        )
        before = session.game.state.to_dict(include_rng=False)
        ws.send_json(
            {"type": "action", "source": illegal.source,
             "color": COLOR_NAMES[illegal.color], "dest": illegal.dest}
        )
        err, _ = drain_until(ws, "error")
        assert err["code"] == "ILLEGAL_ACTION"
        assert session.game.state.to_dict(include_rng=False) == before


def test_bad_message_keeps_the_socket_open(client):
    game_id = create(client)
    with client.websocket_connect(f"/ws/games/{game_id}") as ws:
        drain_until(ws, "legal_actions")
        ws.send_json({"type": "nonsense"})
        err, _ = drain_until(ws, "error")
        assert err["code"] == "BAD_MESSAGE"
        ws.send_json({"type": "resync"})
        state, _ = drain_until(ws, "state")
        assert state["game_id"] == game_id


def test_action_on_the_ai_turn_is_refused(client):
    """In an eve game every turn belongs to an agent, so a human action is refused."""
    game_id = create(client, mode="eve", ai0="random", ai1="random", seed=2)
    with client.websocket_connect(f"/ws/games/{game_id}") as ws:
        ws.send_json({"type": "eve_control", "command": "pause"})
        ws.send_json({"type": "action", "source": 0, "color": "blue", "dest": 0})
        err, _ = drain_until(ws, "error", limit=80)
        assert err["code"] in {"NOT_YOUR_TURN", "ILLEGAL_ACTION"}


def test_two_sockets_get_the_same_broadcast(client):
    game_id = create(client, seed=13)
    session = manager.get(game_id)
    with client.websocket_connect(f"/ws/games/{game_id}") as a, \
         client.websocket_connect(f"/ws/games/{game_id}") as b:
        drain_until(a, "legal_actions")
        drain_until(b, "legal_actions")
        action = legal_actions(session.game.state)[0]
        a.send_json({"type": "action", "source": action.source,
                     "color": COLOR_NAMES[action.color], "dest": action.dest})
        state_a, _ = drain_until(a, "state")
        state_b, _ = drain_until(b, "state")
        assert state_a["players"] == state_b["players"]


def test_resync_after_reconnect_matches(client):
    game_id = create(client, seed=17)
    session = manager.get(game_id)
    with client.websocket_connect(f"/ws/games/{game_id}") as ws:
        drain_until(ws, "legal_actions")
        action = legal_actions(session.game.state)[0]
        ws.send_json({"type": "action", "source": action.source,
                      "color": COLOR_NAMES[action.color], "dest": action.dest})
        first, _ = drain_until(ws, "state")
    with client.websocket_connect(f"/ws/games/{game_id}") as ws2:
        ws2.send_json({"type": "resync"})
        again, _ = drain_until(ws2, "state")
    assert again["round_num"] >= first["round_num"]
    assert {k: v for k, v in again.items() if k != "type"} == client.get(
        f"/api/games/{game_id}"
    ).json()


def test_log_export_replays_to_the_same_state(client):
    game_id = create(client, seed=23)
    session = manager.get(game_id)
    rng = random.Random(9)
    with client.websocket_connect(f"/ws/games/{game_id}") as ws:
        drain_until(ws, "state")
        for _ in range(12):
            legal, _ = drain_until(ws, "legal_actions")
            if not legal["actions"] or session.game.is_over():
                break
            choice = rng.choice(legal["detail"])
            ws.send_json({"type": "action", **{k: choice[k] for k in ("source", "color", "dest")}})
        drain_until(ws, "state")

    record = client.get(f"/api/games/{game_id}/log").json()
    replay = QuadroGame.from_log(record)
    assert replay.state.to_dict(include_rng=False) == session.game.state.to_dict(include_rng=False)
