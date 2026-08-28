"""The training half of AzulZero. Skipped where PyTorch is not installed.

Serving and training are two different implementations of the same network — the
torch module and the numpy forward pass in `zero.numpy_net` — so the parity test
here is what keeps a trained checkpoint playing the same way once it is exported
and loaded by the agent.
"""

from __future__ import annotations

import numpy as np
import pytest

torch = pytest.importorskip("torch")

from engine.constants import NUM_ACTIONS  # noqa: E402
from zero.encode import NUM_FEATURES  # noqa: E402
from zero.export import export, to_numpy_weights  # noqa: E402
from zero.mcts import SearchConfig  # noqa: E402
from zero.model import AzulZeroNet, ModelConfig, load_checkpoint, save_checkpoint  # noqa: E402
from zero.numpy_net import NumpyNet  # noqa: E402
from zero.replay import ReplayBuffer  # noqa: E402
from zero.selfplay import SelfPlayConfig, play_games  # noqa: E402
from zero.train import TorchEvaluator, TrainConfig, train_epoch  # noqa: E402

SMALL = ModelConfig(width=64, blocks=2, value_hidden=16)


@pytest.fixture(scope="module")
def net():
    torch.manual_seed(0)
    return AzulZeroNet(SMALL).eval()


def test_forward_shapes_and_value_range(net):
    x = torch.randn(7, NUM_FEATURES)
    logits, value = net(x)
    assert logits.shape == (7, NUM_ACTIONS)
    assert value.shape == (7,)
    assert torch.all(value.abs() <= 1.0)


def test_numpy_forward_matches_torch(net):
    """Export must not change what the network says."""
    numpy_net = NumpyNet(to_numpy_weights(net), SMALL.blocks)
    x = np.random.default_rng(0).normal(size=(16, NUM_FEATURES)).astype(np.float32)

    with torch.no_grad():
        t_logits, t_value = net(torch.from_numpy(x))
    n_logits, n_value = numpy_net.infer(x)

    assert np.allclose(n_logits, t_logits.numpy(), atol=1e-4)
    assert np.allclose(n_value, t_value.numpy(), atol=1e-5)


def test_checkpoint_roundtrip_and_export(tmp_path, net):
    checkpoint = tmp_path / "best.pt"
    save_checkpoint(checkpoint, net, {"generation": 3})
    reloaded, meta = load_checkpoint(checkpoint)
    assert meta["generation"] == 3
    assert reloaded.config == SMALL

    weights = tmp_path / "azulzero.npz"
    export(checkpoint, weights)
    from_disk = NumpyNet.load(weights)

    x = np.random.default_rng(1).normal(size=(4, NUM_FEATURES)).astype(np.float32)
    with torch.no_grad():
        t_logits, t_value = net(torch.from_numpy(x))
    n_logits, n_value = from_disk.infer(x)
    assert np.allclose(n_logits, t_logits.numpy(), atol=1e-4)
    assert np.allclose(n_value, t_value.numpy(), atol=1e-5)


def test_numpy_net_rejects_weights_from_a_different_feature_layout():
    """A stale .npz beside a changed encoder must fail loudly, not play badly."""
    stale = AzulZeroNet(ModelConfig(width=32, blocks=1, features=NUM_FEATURES - 1))
    with pytest.raises(ValueError, match="disagree with the engine"):
        NumpyNet(to_numpy_weights(stale), 1)


def test_training_reduces_loss_on_its_own_data():
    """A sanity check on the loss wiring: the net can fit what it is shown."""
    buffer = ReplayBuffer(capacity=2048)
    records = play_games(
        TorchEvaluator(AzulZeroNet(SMALL)),
        2,
        SelfPlayConfig(
            games_in_flight=2,
            augmentations=0,
            search=SearchConfig(simulations=8, dirichlet_epsilon=0.25),
        ),
        seed=4,
    )
    buffer.add_records(records)

    torch.manual_seed(1)
    fresh = AzulZeroNet(SMALL)
    rng = np.random.default_rng(0)
    first = train_epoch(fresh, buffer, TrainConfig(steps=20, batch_size=32), torch.device("cpu"), rng)
    later = train_epoch(fresh, buffer, TrainConfig(steps=120, batch_size=32), torch.device("cpu"), rng)
    assert later.loss < first.loss


def test_afterstate_samples_do_not_contribute_policy_loss():
    """A buffer of value-only samples must still train, with zero policy loss."""
    buffer = ReplayBuffer(capacity=64)

    class ValueOnly:
        def __init__(self, v):
            self.features = np.random.default_rng(v).normal(size=NUM_FEATURES).astype(np.float32)
            self.policy = np.zeros(NUM_ACTIONS, dtype=np.float32)
            self.policy_weight = 0.0
            self.value = 0.5

    buffer.add([ValueOnly(i) for i in range(32)])
    stats = train_epoch(
        AzulZeroNet(SMALL),
        buffer,
        TrainConfig(steps=5, batch_size=16),
        torch.device("cpu"),
        np.random.default_rng(0),
    )
    assert stats.policy_loss == 0.0
    assert stats.value_loss > 0.0
