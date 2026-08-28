"""Export engine parity vectors for the TypeScript port.

The TS engine (web/src/engine) must reproduce this engine's state transitions
exactly. Rather than reproduce Python's Mersenne Twister in the browser (see
BUILD-SPEC A-003), the vectors carry *explicit* states and *explicit* actions:
each one is a serialized `GameState`, a list of action ids, and the serialized
state and events after each action. Nothing in a vector depends on the RNG, so
the two engines may draw tiles differently and still be held to the same rules.

    python -m scripts.export_vectors            # writes web/test/vectors/

Run it from `backend/`. `web/test/parity.test.ts` replays every file.
"""

from __future__ import annotations

import gzip
import json
import random
from pathlib import Path

from ai.greedy_agent import GreedyAgent
from ai.random_agent import RandomAgent
from engine import Action, GameState, QuadroGame
from engine.constants import (
    CENTER,
    NUM_COLORS,
    NUM_DISPLAYS,
    PENALTY_DEST,
    PENALTY_ROW_SIZE,
    TILES_PER_COLOR,
)
from engine.rules import apply_action, legal_actions, settle_round
from engine.state import GAME_OVER

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "web" / "test" / "vectors"

# Number of complete greedy-vs-random games to record (BUILD-SPEC §14.2 asks
# for at least 200, from distinct seeds).
NUM_GAMES = 200


def _record(state: GameState, actions: list[Action], name: str, note: str) -> dict:
    """Replay `actions` against `state`, capturing the state and events at each step.

    Settling is driven the way `QuadroGame.step` drives it — apply, then settle
    when drafting is done — but *without* dealing the next round, because
    dealing consumes randomness and the vectors must stay RNG-free.
    """
    work = state.clone()
    steps = []
    for action in actions:
        undo = apply_action(work, action)
        events = [undo.event]
        if work.drafting_done():
            events.extend(settle_round(work))
        steps.append(
            {
                "action_id": action.action_id,
                "expected_state": work.to_dict(include_rng=False),
                "expected_events": [e.to_dict() for e in events],
            }
        )
        if work.phase == GAME_OVER:
            break
    return {
        "name": name,
        "note": note,
        "initial_state": state.to_dict(include_rng=False),
        "steps": steps,
    }


# ---------------------------------------------------------------- edge cases


def _blank_state() -> GameState:
    """An empty mid-round state with nothing on the table and a full bag."""
    state = GameState(rng=random.Random(0))
    state.bag = [0] * NUM_COLORS
    return state


def _case_basic_draft() -> dict:
    state = _blank_state()
    state.displays[0] = [2, 2, 0, 0, 0]
    state.displays[1] = [0, 0, 4, 0, 0]
    # blue x2 -> row 1 fills it exactly; the yellows go to the center.
    return _record(
        state,
        [Action(0, 0, 1), Action(1, 2, 2)],
        "basic_draft",
        "taking from a display moves the other colors to the center",
    )


def _case_center_and_token() -> dict:
    state = _blank_state()
    state.displays[0] = [1, 3, 0, 0, 0]
    return _record(
        state,
        [Action(0, 0, 0), Action(CENTER, 1, 2)],
        "center_and_token",
        "first taker from the center gets the token and a penalty slot",
    )


def _case_staging_color_lock() -> dict:
    state = _blank_state()
    state.displays[0] = [4, 0, 0, 0, 0]
    state.displays[1] = [0, 4, 0, 0, 0]
    state.players[0].staging_colors[3] = 0
    state.players[0].staging_counts[3] = 1
    # Row 3 already holds blue: it can take more blue, and nothing else.
    return _record(
        state,
        [Action(0, 0, 3), Action(1, 1, 4)],
        "staging_color_lock",
        "a staging row accepts only its own color, up to capacity",
    )


def _case_penalty_overflow() -> dict:
    state = _blank_state()
    state.displays[0] = [4, 0, 0, 0, 0]
    state.displays[1] = [0, 4, 0, 0, 0]
    state.players[0].penalty_tiles = [1] * (PENALTY_ROW_SIZE - 2)
    # Four tiles onto a penalty row with two free slots: two land, two spill to
    # the discard pile.
    return _record(
        state,
        [Action(0, 0, PENALTY_DEST), Action(1, 1, PENALTY_DEST)],
        "penalty_overflow",
        "tiles past the end of a full penalty row go straight to the discard",
    )


def _case_row_overflow_into_penalty() -> dict:
    state = _blank_state()
    state.displays[0] = [4, 0, 0, 0, 0]
    state.displays[1] = [0, 4, 0, 0, 0]
    return _record(
        state,
        [Action(0, 0, 0), Action(1, 1, 0)],
        "row_overflow_into_penalty",
        "row 0 holds one tile; the remaining three fall to the penalty row",
    )


def _case_settle_and_score() -> dict:
    state = _blank_state()
    state.displays[0] = [1, 0, 0, 0, 0]
    state.displays[1] = [0, 1, 0, 0, 0]
    # Both players complete row 0, then drafting is done and the round settles.
    return _record(
        state,
        [Action(0, 0, 0), Action(1, 1, 0)],
        "settle_and_score",
        "completed staging rows move to the grid and score on settle",
    )


def _case_adjacency_scoring() -> dict:
    state = _blank_state()
    state.displays[0] = [1, 0, 0, 0, 0]
    board = state.players[0]
    # Pre-seed neighbors so the settled tile scores a horizontal run.
    board.grid[0][1] = True
    board.grid[0][2] = True
    return _record(
        state,
        [Action(0, 0, 0)],
        "adjacency_scoring",
        "a tile adjacent to an existing run scores the whole run",
    )


def _case_game_end_bonuses() -> dict:
    state = _blank_state()
    state.displays[0] = [1, 0, 0, 0, 0]
    board = state.players[0]
    # One blue away from completing grid row 0, which ends the game.
    for col in range(1, 5):
        board.grid[0][col] = True
    for row in range(1, 5):
        board.grid[row][0] = True
    return _record(
        state,
        [Action(0, 0, 0)],
        "game_end_bonuses",
        "a complete grid row ends the game and triggers row/column/color bonuses",
    )


def _case_tie_on_complete_rows() -> dict:
    state = _blank_state()
    state.displays[0] = [1, 0, 0, 0, 0]
    a, b = state.players
    for col in range(1, 5):
        a.grid[0][col] = True
    a.score = 10
    b.score = 11  # after A's placement and bonus the scores land differently
    return _record(
        state,
        [Action(0, 0, 0)],
        "tie_break_complete_rows",
        "winner decision when scores are close and row counts differ",
    )


def _case_bag_refill_from_discard() -> dict:
    """Drafting with an empty bag and a stocked discard pile.

    Refilling itself is `draw_tile`'s job and is RNG-driven, so the vector only
    pins the *bookkeeping*: settling must return the right tiles to the discard.
    """
    state = _blank_state()
    state.discard = [3, 3, 3, 3, 3]
    state.displays[0] = [3, 0, 0, 0, 0]
    state.displays[1] = [0, 3, 0, 0, 0]
    return _record(
        state,
        [Action(0, 0, 2), Action(1, 1, 2)],
        "discard_accounting",
        "settling a completed row returns capacity-1 tiles to the discard",
    )


def _case_first_token_on_full_penalty() -> dict:
    state = _blank_state()
    state.displays[0] = [2, 0, 0, 0, 0]
    state.center = [0, 2, 0, 0, 0]
    state.players[0].penalty_tiles = [2] * PENALTY_ROW_SIZE
    # The token cannot occupy a slot on a full row, but still sets the flag.
    return _record(
        state,
        [Action(CENTER, 1, 1)],
        "first_token_on_full_penalty",
        "the token sets has_first_token even when the penalty row is full",
    )


def _case_penalty_dest_from_center() -> dict:
    state = _blank_state()
    state.center = [0, 0, 5, 0, 0]
    state.displays[0] = [1, 0, 0, 0, 0]
    return _record(
        state,
        [Action(CENTER, 2, PENALTY_DEST), Action(0, 0, PENALTY_DEST)],
        "penalty_dest_from_center",
        "dumping a group straight onto the penalty row",
    )


EDGE_CASES = (
    _case_basic_draft,
    _case_center_and_token,
    _case_staging_color_lock,
    _case_penalty_overflow,
    _case_row_overflow_into_penalty,
    _case_settle_and_score,
    _case_adjacency_scoring,
    _case_game_end_bonuses,
    _case_tie_on_complete_rows,
    _case_bag_refill_from_discard,
    _case_first_token_on_full_penalty,
    _case_penalty_dest_from_center,
)


# ---------------------------------------------------------------- full games


def _full_game_vector(seed: int) -> dict:
    """Play a whole greedy-vs-random game and record every round separately.

    Each round becomes its own segment: the state as dealt (RNG already spent)
    and the actions played from it. Dealing the next round is excluded, so
    replaying a segment in TypeScript never needs the Python PRNG.
    """
    game = QuadroGame(seed=seed)
    agents = [GreedyAgent(seed=seed), RandomAgent(seed=seed + 1)]
    segments = []
    round_start_state = game.state.clone()
    round_actions: list[Action] = []

    while not game.is_over():
        action = agents[game.current].choose(game.state, game.current)
        round_num = game.state.round_num
        game.step(action)
        round_actions.append(action)
        if game.state.round_num != round_num or game.is_over():
            segments.append(
                _record(
                    round_start_state,
                    round_actions,
                    f"game{seed}_r{round_num}",
                    f"greedy vs random, seed {seed}, round {round_num}",
                )
            )
            round_start_state = game.state.clone()
            round_actions = []

    return {
        "seed": seed,
        "result": game.result().to_dict(),
        "segments": segments,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in list(OUT_DIR.glob("*.json")) + list(OUT_DIR.glob("*.json.gz")):
        old.unlink()

    edge = [make() for make in EDGE_CASES]
    (OUT_DIR / "edge_cases.json").write_text(
        json.dumps({"vectors": edge}, indent=1) + "\n", encoding="utf-8"
    )

    action_ids = [
        {"source": s, "color": c, "dest": d, "action_id": Action(s, c, d).action_id}
        for s in range(NUM_DISPLAYS + 1)
        for c in range(NUM_COLORS)
        for d in range(PENALTY_DEST + 1)
    ]
    (OUT_DIR / "action_ids.json").write_text(
        json.dumps({"actions": action_ids}, indent=1) + "\n", encoding="utf-8"
    )

    games = [_full_game_vector(seed) for seed in range(NUM_GAMES)]
    # ~16MB of JSON uncompressed; gzip keeps the committed fixture reasonable
    # and `parity.test.ts` gunzips it with node's zlib.
    with gzip.open(OUT_DIR / "games.json.gz", "wt", encoding="utf-8") as fh:
        json.dump({"games": games}, fh)

    steps = sum(len(v["steps"]) for v in edge)
    steps += sum(len(s["steps"]) for g in games for s in g["segments"])
    print(f"wrote {OUT_DIR}: {len(edge)} edge vectors, {len(games)} games, {steps} steps")


if __name__ == "__main__":
    main()
