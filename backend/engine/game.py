"""QuadroGame: the round-by-round driver on top of `rules`.

Owns the bag, fills the displays each round, and turns a stream of actions into
a stream of events. AI search does not use this class — it works on `GameState`
through `rules` directly.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from .constants import (
    DISPLAY_SIZE,
    MAX_ROUNDS,
    NUM_COLORS,
    NUM_DISPLAYS,
    TILES_PER_COLOR,
)
from .events import Event, RoundStart
from .rules import apply_action, decide_winner, is_legal, legal_actions, settle_round
from .state import DRAFTING, GAME_OVER, Action, GameState


class IllegalAction(ValueError):
    pass


@dataclass(slots=True)
class GameResult:
    scores: list[int]
    winner: int | None
    draw: bool
    complete_rows: list[int]
    rounds: int

    def to_dict(self) -> dict:
        return {
            "scores": self.scores,
            "winner": self.winner,
            "draw": self.draw,
            "complete_rows": self.complete_rows,
            "rounds": self.rounds,
        }


def draw_tile(state: GameState) -> int | None:
    """Draw one tile from the bag, refilling from the discard pile if needed.

    Returns None only when bag and discard are both empty, in which case the
    display is simply left short and the round proceeds.
    """
    total = sum(state.bag)
    if total == 0:
        if not any(state.discard):
            return None
        for color in range(NUM_COLORS):
            state.bag[color] += state.discard[color]
            state.discard[color] = 0
        total = sum(state.bag)

    pick = state.rng.randrange(total)
    for color in range(NUM_COLORS):
        pick -= state.bag[color]
        if pick < 0:
            state.bag[color] -= 1
            return color
    raise AssertionError("unreachable: weighted draw fell through")


def start_round(state: GameState) -> RoundStart:
    """Fill every display from the bag and hand the token to the center."""
    refilled = False
    short = 0
    for display in state.displays:
        filled = 0
        for _ in range(DISPLAY_SIZE):
            before_empty = sum(state.bag) == 0
            color = draw_tile(state)
            if color is None:
                break
            if before_empty:
                refilled = True
            display[color] += 1
            filled += 1
        if filled < DISPLAY_SIZE:
            short += 1

    state.center_has_token = True
    state.current = state.first_player
    for board in state.players:
        board.has_first_token = False

    return RoundStart(
        round_num=state.round_num,
        first_player=state.first_player,
        bag_refilled=refilled,
        short_displays=short,
    )


def settle_and_deal(state: GameState) -> list[Event]:
    """Close the finished round and deal the next one, unless the game just ended.

    The AI search drives states directly rather than through `QuadroGame`, so the
    round boundary lives here where both callers share it.
    """
    events = settle_round(state)
    if state.phase == GAME_OVER:
        return events
    holder = next(
        (i for i, p in enumerate(state.players) if p.has_first_token), state.first_player
    )
    state.first_player = holder
    state.round_num += 1
    if state.round_num > MAX_ROUNDS:
        raise AssertionError("round cap exceeded; the game failed to terminate")
    events.append(start_round(state))
    return events


class QuadroGame:
    def __init__(self, seed: int | None = None):
        self.seed = seed if seed is not None else random.randrange(2**31)
        self.state = GameState(rng=random.Random(self.seed))
        self.state.first_player = self.state.rng.randrange(2)
        self.history: list[Action] = []
        self.events: list[Event] = [start_round(self.state)]

    # ---- queries -----------------------------------------------------

    def legal_actions(self) -> list[Action]:
        return legal_actions(self.state)

    def is_over(self) -> bool:
        return self.state.phase == GAME_OVER

    @property
    def current(self) -> int:
        return self.state.current

    def result(self) -> GameResult:
        winner, draw = decide_winner(self.state)
        return GameResult(
            scores=[p.score for p in self.state.players],
            winner=winner,
            draw=draw,
            complete_rows=[p.complete_rows() for p in self.state.players],
            rounds=self.state.round_num,
        )

    # ---- driving -----------------------------------------------------

    def step(self, action: Action) -> list[Event]:
        """Apply one action, settling the round and dealing the next if needed."""
        if self.state.phase == GAME_OVER:
            raise IllegalAction("the game is over")
        if not is_legal(self.state, action):
            raise IllegalAction(f"illegal action: {action.describe()}")

        undo = apply_action(self.state, action)
        self.history.append(action)
        events: list[Event] = [undo.event]

        if self.state.drafting_done():
            events.extend(settle_and_deal(self.state))

        self.events.extend(events)
        return events

    def to_log(self, players: list[dict] | None = None, mode: str = "local") -> dict:
        """Serialize the game as a replayable record (see docs/plans/05)."""
        return {
            "version": 1,
            "seed": self.seed,
            "mode": mode,
            "players": players or [{"kind": "unknown"}, {"kind": "unknown"}],
            "actions": [a.to_dict() for a in self.history],
            "final": self.result().to_dict() if self.is_over() else None,
        }

    @staticmethod
    def from_log(log: dict) -> "QuadroGame":
        """Replay a record from its seed and verify every action is legal."""
        game = QuadroGame(seed=log["seed"])
        for i, raw in enumerate(log["actions"]):
            action = Action.from_dict(raw)
            if not is_legal(game.state, action):
                raise IllegalAction(f"replay diverged at action {i}: {action.describe()}")
            game.step(action)
        return game
