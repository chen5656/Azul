"""Agent contract tests: legality, determinism, and no side effects on the state."""

import time

import pytest

from ai import GreedyAgent, MctsAgent, MinimaxAgent, RandomAgent, make_agent
from ai.evaluate import evaluate, side_value
from engine import QuadroGame, is_legal
from engine.constants import STAGING_CAPACITY


def fast_agents():
    """One instance per level, with search budgets small enough for CI."""
    return [
        RandomAgent(seed=1),
        GreedyAgent(seed=1),
        MinimaxAgent(seed=1, depth=3, time_budget=0.2),
        MctsAgent(seed=1, time_budget=0.05),
    ]


@pytest.mark.parametrize("agent", fast_agents(), ids=lambda a: a.level)
def test_agent_plays_a_legal_game(agent):
    game = QuadroGame(seed=11)
    while not game.is_over():
        player = game.current
        action = agent.choose(game.state, player)
        assert is_legal(game.state, action)
        game.step(action)
    assert game.result().scores


@pytest.mark.parametrize("agent", fast_agents(), ids=lambda a: a.level)
def test_agent_does_not_mutate_the_state(agent):
    game = QuadroGame(seed=5)
    before = game.state.to_dict()
    agent.choose(game.state, game.current)
    assert game.state.to_dict() == before


@pytest.mark.parametrize("agent", fast_agents(), ids=lambda a: a.level)
def test_agent_respects_the_move_budget(agent):
    game = QuadroGame(seed=5)
    start = time.monotonic()
    agent.choose(game.state, game.current)
    assert time.monotonic() - start < 0.5


@pytest.mark.parametrize("level", ["random", "greedy", "minimax", "mcts"])
def test_same_seed_same_moves(level):
    def run():
        agent = make_agent(level, seed=7)
        if level == "mcts":
            agent.time_budget, agent.max_simulations = 10.0, 30  # sims, not wall clock
        if level == "minimax":
            agent.time_budget = 10.0  # depth-bounded, so the result is reproducible
        game = QuadroGame(seed=3)
        moves = []
        for _ in range(6):
            action = agent.choose(game.state, game.current)
            moves.append(action.action_id)
            game.step(action)
        return moves

    assert run() == run()


def test_make_agent_rejects_unknown_level():
    with pytest.raises(ValueError):
        make_agent("grandmaster")


def test_evaluate_is_zero_sum():
    game = QuadroGame(seed=9)
    for _ in range(8):
        game.step(GreedyAgent(seed=0).choose(game.state, game.current))
    assert evaluate(game.state, 0) == pytest.approx(-evaluate(game.state, 1))


def test_completed_staging_row_is_worth_more_than_a_partial_one(blank):
    board = blank.players[0]
    board.staging_colors[2], board.staging_counts[2] = 0, 1
    partial = side_value(blank, 0)
    board.staging_counts[2] = STAGING_CAPACITY[2]
    assert side_value(blank, 0) > partial


def test_penalty_tiles_lower_the_evaluation(blank):
    clean = side_value(blank, 0)
    blank.players[0].penalty_tiles.extend([1, 1, 1])
    assert side_value(blank, 0) < clean


def test_greedy_prefers_a_staging_row_over_dumping_to_penalty():
    game = QuadroGame(seed=4)
    action = GreedyAgent(seed=0).choose(game.state, game.current)
    assert action.dest != 5


def test_greedy_beats_random_over_a_short_match():
    wins = 0
    for seed in range(6):
        agents = [GreedyAgent(seed=seed), RandomAgent(seed=seed)]
        game = QuadroGame(seed=seed)
        while not game.is_over():
            game.step(agents[game.current].choose(game.state, game.current))
        if game.state.players[0].score > game.state.players[1].score:
            wins += 1
    assert wins == 6


def test_benchmark_runs_end_to_end(capsys):
    from scripts.benchmark import main, play, wilson

    assert main(["--p0", "greedy", "--p1", "random", "--games", "2", "--swap"]) == 0
    assert "win rate" in capsys.readouterr().out

    # --swap seats the same agent on both sides of one deal.
    a, b = play(1, "greedy", "random", False), play(1, "greedy", "random", True)
    assert a.swapped is False and b.swapped is True

    low, high = wilson(1.0, 2)
    assert 0.0 <= low <= high <= 1.0
    assert wilson(0, 0) == (0.0, 0.0)
