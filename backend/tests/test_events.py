"""Event serialization — the wire format the server and the replay file share."""

import json
import random

from engine.constants import CENTER, RED
from engine.events import Draft, GameEnd, RoundStart, TileScored
from engine.game import QuadroGame
from engine.rules import preview
from engine.state import Action


def test_events_serialize_to_json_with_named_colors():
    event = Draft(
        player=0, source=CENTER, color=RED, count=3, dest=1,
        placed=2, overflow=1, to_discard=0, took_first_token=True,
    )
    d = event.to_dict()
    assert d["kind"] == "draft"
    assert d["color"] == "red"
    assert json.loads(json.dumps(d)) == d


def test_every_event_from_a_real_game_is_json_serializable():
    game = QuadroGame(seed=21)
    rng = random.Random(21)
    while not game.is_over():
        game.step(rng.choice(game.legal_actions()))
    payload = [e.to_dict() for e in game.events]
    assert json.loads(json.dumps(payload)) == payload
    assert {e["kind"] for e in payload} >= {"draft", "tile_scored", "round_start", "game_end"}


def test_tile_scored_carries_the_run_lengths():
    d = TileScored(player=1, row=2, col=3, color=RED, points=5, horizontal=3, vertical=2).to_dict()
    assert (d["horizontal"], d["vertical"], d["points"]) == (3, 2, 5)
    assert d["color"] == "red"


def test_game_end_keeps_a_null_winner_on_a_draw():
    d = GameEnd(scores=[30, 30], winner=None, draw=True).to_dict()
    assert d["winner"] is None and d["draw"] is True


def test_round_start_reports_bag_state():
    d = RoundStart(round_num=3, first_player=1, bag_refilled=True, short_displays=2).to_dict()
    assert d["bag_refilled"] is True and d["short_displays"] == 2


def test_preview_serializes():
    game = QuadroGame(seed=4)
    action = game.legal_actions()[0]
    d = preview(game.state, action).to_dict()
    assert set(d) == {"count", "placed", "overflow", "to_discard", "takes_token", "penalty_delta"}
    assert json.loads(json.dumps(d)) == d


def test_action_serializes_with_an_id():
    d = Action(2, RED, 4).to_dict()
    assert d == {"source": 2, "color": "red", "dest": 4, "action_id": 76}
    assert Action.from_dict(d) == Action(2, RED, 4)
    assert Action.from_dict({"source": 2, "color": 2, "dest": 4}) == Action(2, RED, 4)


def test_convenience_accessors():
    game = QuadroGame(seed=4)
    assert game.current == game.state.current
    assert game.state.source_counts(CENTER) is game.state.center
    assert game.state.source_counts(1) is game.state.displays[1]
