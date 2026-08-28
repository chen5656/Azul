"""Tests for the terminal client: move parsing, rendering, undo, headless mode."""

import json
import random

import pytest

from engine.constants import BLACK, CENTER, PENALTY_DEST, RED, YELLOW
from engine.game import QuadroGame
from engine.rules import legal_actions, preview
from engine.state import Action
from scripts import cli


@pytest.fixture(autouse=True)
def no_color(monkeypatch):
    monkeypatch.setattr(cli, "USE_COLOR", False)


# ---------------------------------------------------------------- parsing


@pytest.mark.parametrize(
    "text, expected",
    [
        ("d2 y 3", Action(2, YELLOW, 2)),
        ("2 yellow 3", Action(2, YELLOW, 2)),
        ("c r f", Action(CENTER, RED, PENALTY_DEST)),
        ("center red penalty", Action(CENTER, RED, PENALTY_DEST)),
        ("d0 k 1", Action(0, BLACK, 0)),
    ],
)
def test_parse_shorthand_accepts_common_forms(text, expected):
    assert cli.parse_shorthand(text, [expected]) == expected


@pytest.mark.parametrize("text", ["", "d2 y", "d2 y 3 4", "dx y 3", "d2 purple 3", "d2 y z"])
def test_parse_shorthand_rejects_junk(text):
    assert cli.parse_shorthand(text, [Action(2, YELLOW, 2)]) is None


def test_parse_shorthand_rejects_a_move_that_is_not_legal():
    assert cli.parse_shorthand("d2 y 3", [Action(0, YELLOW, 2)]) is None


# ---------------------------------------------------------------- rendering


def test_board_lines_are_all_the_same_width():
    game = QuadroGame(seed=5)
    rng = random.Random(5)
    for _ in range(30):
        game.step(rng.choice(game.legal_actions()))
    for index, board in enumerate(game.state.players):
        lines = cli.render_board(board, index, "test", active=index == 0)
        widths = {cli.visible_len(line) for line in lines}
        assert widths == {cli.BOARD_WIDTH}


def test_render_survives_a_whole_game():
    game = QuadroGame(seed=6)
    rng = random.Random(6)
    while not game.is_over():
        text = cli.render(game.state, ["a", "b"])
        assert "Round" in text
        game.step(rng.choice(game.legal_actions()))


def test_visible_len_ignores_ansi_escapes():
    assert cli.visible_len("\033[94mB\033[0m") == 1
    assert cli.visible_len("abc") == 3


def test_every_event_renders_a_line():
    game = QuadroGame(seed=8)
    rng = random.Random(8)
    kinds = set()
    while not game.is_over():
        for event in game.step(rng.choice(game.legal_actions())):
            assert cli.render_event(event) is not None
            kinds.add(event.kind)
    assert {"draft", "tile_scored", "penalty", "round_end", "bonus", "game_end"} <= kinds


def test_format_move_reports_the_engine_preview():
    game = QuadroGame(seed=12)
    state = game.state
    for action in legal_actions(state):
        text = cli.format_move(state, action)
        p = preview(state, action)
        if p.overflow:
            assert f"{p.overflow} overflow" in text
        if p.takes_token:
            assert "takes token" in text
        if p.penalty_delta:
            assert f"penalty {p.penalty_delta:+d}" in text


# ---------------------------------------------------------------- undo


def test_rewind_returns_to_the_humans_own_turn():
    """Undo in a game against an agent must skip back over the agent's reply."""
    game = QuadroGame(seed=42)
    agents = {1: lambda g: g.legal_actions()[0]}
    snapshots = []

    snapshots.append(cli.take_snapshot(game))
    game.step(game.legal_actions()[0])  # human
    snapshots.append(cli.take_snapshot(game))
    game.step(agents[1](game))  # agent
    assert game.state.current == 0

    assert cli.rewind(game, snapshots, agents) is True
    assert game.state.current == 0  # our turn again, not the agent's
    assert game.history == []
    assert cli.rewind(game, snapshots, agents) is False


def test_rewind_restores_the_position_exactly():
    game = QuadroGame(seed=13)
    before = game.state.to_dict()
    snapshots = [cli.take_snapshot(game)]
    game.step(game.legal_actions()[0])
    assert game.state.to_dict() != before
    cli.rewind(game, snapshots, {})
    assert game.state.to_dict() == before


# ---------------------------------------------------------------- modes


def test_auto_mode_runs_and_checks_invariants(capsys):
    args = cli.argparse.Namespace(auto=["random", "random"], games=5, seed=1)
    cli.auto(args)
    out = capsys.readouterr().out
    assert "5 games" in out
    assert "average score" in out


def test_save_produces_a_replayable_record(tmp_path):
    game = QuadroGame(seed=31)
    rng = random.Random(31)
    while not game.is_over():
        game.step(rng.choice(game.legal_actions()))

    path = tmp_path / "game.json"
    path.write_text(json.dumps(game.to_log(mode="cli")))

    log = json.loads(path.read_text())
    replayed = QuadroGame.from_log(log)
    assert replayed.result() == game.result()


def test_make_agent_rejects_unknown_names():
    with pytest.raises(SystemExit):
        cli.make_agent("oracle", random.Random(0))


def test_make_agent_accepts_every_declared_level():
    for level in ("random", "greedy", "minimax", "mcts"):
        agent = cli.make_agent(level, random.Random(0))
        assert callable(agent)
