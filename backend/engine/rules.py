"""Rules of Quadro: legal move generation, move application, round settling.

This is the low-level layer the AI search calls directly. `apply_action` returns
an `Undo` record so a search can walk the tree without cloning; `clone()` plus
`apply_action` is the simpler path used everywhere else. Both paths are held to
the same result by tests.

`apply_action` deliberately does *not* settle the round — the caller checks
`state.drafting_done()` and calls `settle_round`. Keeping settling out of the
undo path is what makes `Undo` small and safe.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .constants import (
    BONUS_COLOR,
    BONUS_COLUMN,
    BONUS_ROW,
    CENTER,
    FIRST_TOKEN,
    GRID_COL,
    GRID_SIZE,
    NUM_COLORS,
    NUM_DISPLAYS,
    NUM_ROWS,
    PENALTY_DEST,
    PENALTY_ROW_SIZE,
    PENALTY_TOTALS,
    STAGING_CAPACITY,
)
from .events import (
    BonusAwarded,
    Draft,
    Event,
    GameEnd,
    PenaltyApplied,
    RoundEnd,
    TileScored,
)
from .state import GAME_OVER, Action, GameState


# ---------------------------------------------------------------- legality


def can_stage(board, row: int, color: int) -> bool:
    """Whether `color` may be placed on staging `row` of `board`."""
    if board.grid[row][GRID_COL[row][color]]:
        return False  # that color is already settled on this grid row
    current = board.staging_colors[row]
    if current < 0:
        return True
    return current == color and board.staging_counts[row] < STAGING_CAPACITY[row]


def legal_actions(state: GameState) -> list[Action]:
    """Every legal action for `state.current`.

    Dumping a whole group onto the penalty row is always available, so a player
    can never be left without a move while tiles remain.
    """
    if state.phase == GAME_OVER:
        return []
    board = state.players[state.current]
    out: list[Action] = []
    for source in range(NUM_DISPLAYS + 1):
        counts = state.center if source == CENTER else state.displays[source]
        for color in range(NUM_COLORS):
            if not counts[color]:
                continue
            for row in range(NUM_ROWS):
                if can_stage(board, row, color):
                    out.append(Action(source, color, row))
            out.append(Action(source, color, PENALTY_DEST))
    return out


def is_legal(state: GameState, action: Action) -> bool:
    if state.phase == GAME_OVER:
        return False
    if not (0 <= action.source <= CENTER and 0 <= action.color < NUM_COLORS):
        return False
    if not (0 <= action.dest <= PENALTY_DEST):
        return False
    counts = state.center if action.source == CENTER else state.displays[action.source]
    if not counts[action.color]:
        return False
    if action.dest == PENALTY_DEST:
        return True
    return can_stage(state.players[state.current], action.dest, action.color)


# ---------------------------------------------------------------- preview


@dataclass(slots=True)
class Preview:
    """What an action would do, without doing it.

    Used by the CLI move list and by the frontend's placement preview, so both
    surfaces show numbers computed by the engine rather than re-deriving them.
    """

    count: int  # tiles taken from the source
    placed: int  # tiles landing on the staging row
    overflow: int  # tiles landing on the penalty row
    to_discard: int  # tiles falling off the end of a full penalty row
    takes_token: bool
    penalty_before: int
    penalty_after: int

    @property
    def penalty_delta(self) -> int:
        return self.penalty_after - self.penalty_before

    def to_dict(self) -> dict:
        return {
            "count": self.count,
            "placed": self.placed,
            "overflow": self.overflow,
            "to_discard": self.to_discard,
            "takes_token": self.takes_token,
            "penalty_delta": self.penalty_delta,
        }


def preview(state: GameState, action: Action) -> Preview:
    board = state.players[state.current]
    counts = state.center if action.source == CENTER else state.displays[action.source]
    count = counts[action.color]
    takes_token = action.source == CENTER and state.center_has_token

    slots_used = len(board.penalty_tiles)
    penalty_before = PENALTY_TOTALS[slots_used]
    if takes_token and slots_used < PENALTY_ROW_SIZE:
        slots_used += 1

    if action.dest == PENALTY_DEST:
        placed = 0
        overflow = count
    else:
        room = STAGING_CAPACITY[action.dest] - board.staging_counts[action.dest]
        placed = min(count, room)
        overflow = count - placed

    free = PENALTY_ROW_SIZE - slots_used
    onto_row = min(overflow, free)
    to_discard = overflow - onto_row
    penalty_after = PENALTY_TOTALS[slots_used + onto_row]

    return Preview(
        count=count,
        placed=placed,
        overflow=overflow,
        to_discard=to_discard,
        takes_token=takes_token,
        penalty_before=penalty_before,
        penalty_after=penalty_after,
    )


# ---------------------------------------------------------------- apply/undo


@dataclass(slots=True)
class Undo:
    action: Action
    current: int
    display_before: list[int] | None
    center_before: list[int]
    center_has_token: bool
    player: int
    staging_color: int
    staging_count: int
    penalty_tiles: list[int]
    penalty_overflow: int
    discard_before: list[int]
    has_first_token: bool
    event: Draft


def apply_action(state: GameState, action: Action) -> Undo:
    """Apply `action` for `state.current`. Does not settle the round."""
    player = state.current
    board = state.players[player]

    undo = Undo(
        action=action,
        current=player,
        display_before=None if action.source == CENTER else state.displays[action.source][:],
        center_before=state.center[:],
        center_has_token=state.center_has_token,
        player=player,
        staging_color=board.staging_colors[action.dest] if action.dest != PENALTY_DEST else -1,
        staging_count=board.staging_counts[action.dest] if action.dest != PENALTY_DEST else 0,
        penalty_tiles=board.penalty_tiles[:],
        penalty_overflow=board.penalty_overflow,
        discard_before=state.discard[:],
        has_first_token=board.has_first_token,
        event=None,  # type: ignore[arg-type]
    )

    color = action.color
    took_token = False

    if action.source == CENTER:
        count = state.center[color]
        state.center[color] = 0
        if state.center_has_token:
            state.center_has_token = False
            board.has_first_token = True
            took_token = True
            # The token occupies a penalty slot; if the row is already full it
            # costs nothing but the player still leads the next round.
            if len(board.penalty_tiles) < PENALTY_ROW_SIZE:
                board.penalty_tiles.append(FIRST_TOKEN)
    else:
        display = state.displays[action.source]
        count = display[color]
        display[color] = 0
        for other in range(NUM_COLORS):
            if display[other]:
                state.center[other] += display[other]
                display[other] = 0

    # Place the tiles: staging row first, remainder onto the penalty row.
    if action.dest == PENALTY_DEST:
        placed = 0
        overflow = count
    else:
        row = action.dest
        room = STAGING_CAPACITY[row] - board.staging_counts[row]
        placed = count if count < room else room
        overflow = count - placed
        if placed:
            board.staging_colors[row] = color
            board.staging_counts[row] += placed

    to_discard = 0
    for _ in range(overflow):
        if len(board.penalty_tiles) < PENALTY_ROW_SIZE:
            board.penalty_tiles.append(color)
        else:
            board.penalty_overflow += 1
            state.discard[color] += 1
            to_discard += 1

    state.current = 1 - player

    undo.event = Draft(
        player=player,
        source=action.source,
        color=color,
        count=count,
        dest=action.dest,
        placed=placed,
        overflow=overflow - to_discard,
        to_discard=to_discard,
        took_first_token=took_token,
    )
    return undo


def undo_action(state: GameState, undo: Undo) -> None:
    if undo.display_before is not None:
        state.displays[undo.action.source][:] = undo.display_before
    state.center[:] = undo.center_before
    state.center_has_token = undo.center_has_token
    state.discard[:] = undo.discard_before
    board = state.players[undo.player]
    if undo.action.dest != PENALTY_DEST:
        board.staging_colors[undo.action.dest] = undo.staging_color
        board.staging_counts[undo.action.dest] = undo.staging_count
    board.penalty_tiles[:] = undo.penalty_tiles
    board.penalty_overflow = undo.penalty_overflow
    board.has_first_token = undo.has_first_token
    state.current = undo.current


# ---------------------------------------------------------------- scoring


def score_placement(grid: list[list[bool]], row: int, col: int) -> tuple[int, int, int]:
    """Points for the tile just set at (row, col); returns (points, H, V).

    A run of length 1 in a direction scores nothing on its own; a tile with no
    neighbors at all scores 1.
    """
    h = 1
    c = col - 1
    while c >= 0 and grid[row][c]:
        h += 1
        c -= 1
    c = col + 1
    while c < GRID_SIZE and grid[row][c]:
        h += 1
        c += 1

    v = 1
    r = row - 1
    while r >= 0 and grid[r][col]:
        v += 1
        r -= 1
    r = row + 1
    while r < NUM_ROWS and grid[r][col]:
        v += 1
        r += 1

    points = (h if h > 1 else 0) + (v if v > 1 else 0)
    if points == 0:
        points = 1
    return points, h, v


def settle_round(state: GameState) -> list[Event]:
    """Move completed staging rows onto the grid, score them, apply penalties.

    Players settle in fixed order 0 then 1 so the event stream is deterministic.
    Rows settle top to bottom because a tile placed on an earlier row can extend
    the vertical run of a tile placed on a later one.
    """
    events: list[Event] = []

    for player, board in enumerate(state.players):
        for row in range(NUM_ROWS):
            if board.staging_counts[row] != STAGING_CAPACITY[row]:
                continue
            color = board.staging_colors[row]
            col = GRID_COL[row][color]
            board.grid[row][col] = True
            points, h, v = score_placement(board.grid, row, col)
            board.score += points
            state.discard[color] += STAGING_CAPACITY[row] - 1
            board.staging_colors[row] = -1
            board.staging_counts[row] = 0
            events.append(
                TileScored(
                    player=player, row=row, col=col, color=color,
                    points=points, horizontal=h, vertical=v,
                )
            )

        tiles = len(board.penalty_tiles)
        if tiles or board.penalty_overflow:
            points = PENALTY_TOTALS[tiles]
            board.score = max(0, board.score + points)
            for tile in board.penalty_tiles:
                if tile != FIRST_TOKEN:
                    state.discard[tile] += 1
            board.penalty_tiles.clear()
            board.penalty_overflow = 0
            events.append(
                PenaltyApplied(
                    player=player, tiles=tiles, points=points, score_after=board.score
                )
            )

    events.append(
        RoundEnd(round_num=state.round_num, scores=[p.score for p in state.players])
    )

    if any(p.has_complete_row() for p in state.players):
        state.phase = GAME_OVER
        events.extend(final_scoring(state))
    return events


def final_scoring(state: GameState) -> list[Event]:
    """End-of-game bonuses and the result event."""
    events: list[Event] = []
    for player, board in enumerate(state.players):
        rows = board.complete_rows()
        cols = board.complete_columns()
        colors = board.complete_colors()
        points = rows * BONUS_ROW + cols * BONUS_COLUMN + colors * BONUS_COLOR
        board.score = max(0, board.score + points)
        events.append(
            BonusAwarded(player=player, rows=rows, columns=cols, colors=colors, points=points)
        )

    scores = [p.score for p in state.players]
    winner, draw = decide_winner(state)
    events.append(GameEnd(scores=scores, winner=winner, draw=draw))
    return events


def decide_winner(state: GameState) -> tuple[int | None, bool]:
    """Highest score wins; ties break on completed rows, then it is a draw."""
    a, b = state.players
    if a.score != b.score:
        return (0, False) if a.score > b.score else (1, False)
    ra, rb = a.complete_rows(), b.complete_rows()
    if ra != rb:
        return (0, False) if ra > rb else (1, False)
    return None, True
