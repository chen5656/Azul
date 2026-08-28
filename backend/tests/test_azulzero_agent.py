"""The deployed `azulzero` level: registry wiring, weight loading, move budget.

These run against a tiny throwaway network rather than the real weights, so the
suite stays fast and does not depend on a finished training run.
"""

from __future__ import annotations

import time

import pytest

from ai import CLASSIC_LEVELS, LEVELS, available_levels, make_agent
from ai.azulzero_agent import AzulZeroAgent, WeightsMissing, load_network
from engine import QuadroGame, is_legal

torch = pytest.importorskip("torch")

from zero.export import export  # noqa: E402
from zero.model import AzulZeroNet, ModelConfig, save_checkpoint  # noqa: E402


@pytest.fixture(scope="module")
def weights(tmp_path_factory):
    """A small untrained network, exported the same way a real run would be."""
    directory = tmp_path_factory.mktemp("weights")
    checkpoint = directory / "best.pt"
    torch.manual_seed(0)
    save_checkpoint(checkpoint, AzulZeroNet(ModelConfig(width=64, blocks=2, value_hidden=16)))
    path = directory / "azulzero.npz"
    export(checkpoint, path)
    return path


def test_registry_lists_the_level_but_gates_it_on_weights():
    assert "azulzero" in LEVELS
    assert "azulzero" not in CLASSIC_LEVELS
    assert set(CLASSIC_LEVELS) <= set(available_levels())


def test_missing_weights_fail_with_an_actionable_message(tmp_path):
    with pytest.raises(WeightsMissing, match="zero.loop"):
        load_network(tmp_path / "absent.npz")


def test_classic_levels_do_not_need_the_zero_package():
    for level in CLASSIC_LEVELS:
        assert make_agent(level, seed=1) is not None


def test_agent_plays_a_legal_move(weights):
    agent = AzulZeroAgent(seed=1, simulations=32, time_budget=0.0, weights=weights)
    game = QuadroGame(seed=8)
    action = agent.choose(game.state, game.current)
    assert is_legal(game.state, action)


def test_agent_finishes_a_whole_game(weights):
    agents = [AzulZeroAgent(seed=i, simulations=16, time_budget=0.0, weights=weights) for i in range(2)]
    game = QuadroGame(seed=12)
    while not game.is_over():
        game.step(agents[game.current].choose(game.state, game.current))
    assert game.result().rounds >= 2


def test_agent_respects_its_move_budget(weights):
    agent = AzulZeroAgent(seed=2, simulations=1_000_000, time_budget=0.2, weights=weights)
    game = QuadroGame(seed=8)
    start = time.monotonic()
    agent.choose(game.state, game.current)
    elapsed = time.monotonic() - start
    assert elapsed < 0.5
    assert agent.simulations_used < 1_000_000


def test_same_seed_same_move(weights):
    game = QuadroGame(seed=15)

    def run():
        agent = AzulZeroAgent(seed=3, simulations=48, time_budget=0.0, weights=weights)
        return agent.choose(game.state, game.current).action_id

    assert run() == run()


def test_network_is_loaded_once_per_path(weights):
    assert load_network(weights) is load_network(weights)
