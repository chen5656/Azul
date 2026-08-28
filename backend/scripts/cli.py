"""Terminal client for Quadro.

This exists so the rules can be checked by a human before any of the web stack
is built. It renders the whole table every turn, lists every legal move with the
consequences the engine computes for it, and prints the full scoring breakdown
each time a round settles.

    python -m scripts.cli                       # hot-seat, two humans
    python -m scripts.cli --seed 42             # reproducible deal
    python -m scripts.cli --p1 random           # play the random agent
    python -m scripts.cli --auto random random --games 100
    python -m scripts.cli --replay game.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.constants import (  # noqa: E402
    CENTER,
    COLOR_INITIALS,
    COLOR_NAMES,
    FIRST_TOKEN,
    GRID_COLOR,
    GRID_SIZE,
    NUM_COLORS,
    NUM_DISPLAYS,
    NUM_ROWS,
    PENALTIES,
    PENALTY_DEST,
    PENALTY_ROW_SIZE,
    STAGING_CAPACITY,
    TILES_PER_COLOR,
)
from engine.events import (  # noqa: E402
    BonusAwarded,
    Draft,
    GameEnd,
    PenaltyApplied,
    RoundEnd,
    RoundStart,
    TileScored,
)
from engine.game import QuadroGame  # noqa: E402
from engine.rules import legal_actions, preview  # noqa: E402
from engine.state import Action, GameState  # noqa: E402

# ---------------------------------------------------------------- rendering

ANSI = ("\033[94m", "\033[93m", "\033[91m", "\033[90m", "\033[97m")
RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
USE_COLOR = True


def paint(text: str, color: int, dim: bool = False) -> str:
    if not USE_COLOR:
        return text
    return f"{DIM if dim else ''}{ANSI[color]}{text}{RESET}"


def tile_char(color: int, filled: bool = True) -> str:
    if color == FIRST_TOKEN:
        return paint("T", 4) if USE_COLOR else "T"
    ch = COLOR_INITIALS[color]
    return paint(ch if filled else ch.lower(), color, dim=not filled)


def visible_len(text: str) -> int:
    """Length ignoring ANSI escapes, so padding stays correct when colored."""
    out, i = 0, 0
    while i < len(text):
        if text[i] == "\033":
            i = text.index("m", i) + 1
            continue
        out += 1
        i += 1
    return out


def pad(text: str, width: int) -> str:
    return text + " " * max(0, width - visible_len(text))


# "│ " + 5 staging cells + " │ " + 5 grid cells + " │"  ->  2 + 9 + 3 + 9 + 1
BOARD_WIDTH = 25


def render_board(board, index: int, label: str, active: bool) -> list[str]:
    """One player's board as a list of lines, each exactly BOARD_WIDTH wide."""
    marker = "◆" if active else "─"
    left = f"┌{marker} P{index} {label} "
    score = f" {board.score} pts ┐"
    head = left + "─" * max(1, BOARD_WIDTH - visible_len(left) - visible_len(score)) + score

    lines = [head]
    for r in range(NUM_ROWS):
        capacity = STAGING_CAPACITY[r]
        color = board.staging_colors[r]
        count = board.staging_counts[r]
        cells = []
        for slot in range(NUM_ROWS):
            if slot < NUM_ROWS - capacity:
                cells.append(" ")  # staging rows are right-aligned
            else:
                position = slot - (NUM_ROWS - capacity)
                filled = position >= capacity - count
                cells.append(tile_char(color, True) if filled and color >= 0 else "·")
        staging = " ".join(cells)

        grid_cells = []
        for c in range(GRID_SIZE):
            grid_cells.append(tile_char(GRID_COLOR[r][c], board.grid[r][c]))
        grid = " ".join(grid_cells)

        lines.append(f"│ {staging} │ {grid} │")

    slots = []
    for i in range(PENALTY_ROW_SIZE):
        if i < len(board.penalty_tiles):
            slots.append(tile_char(board.penalty_tiles[i]))
        else:
            slots.append("·")
    total = board.penalty_total()
    extra = f"+{board.penalty_overflow}" if board.penalty_overflow else ""
    penalty = f"│ {' '.join(slots)} {total:>3} {extra}"
    lines.append(pad(penalty, BOARD_WIDTH - 1) + "│")
    lines.append("└" + "─" * (BOARD_WIDTH - 2) + "┘")
    return lines


def render_sources(state: GameState) -> list[str]:
    lines = []
    row: list[str] = []
    for i in range(NUM_DISPLAYS):
        tiles = []
        for color in range(NUM_COLORS):
            tiles.extend(tile_char(color) for _ in range(state.displays[i][color]))
        while len(tiles) < 4:
            tiles.append("·")
        row.append(f"D{i} [{' '.join(tiles)}]")
        if len(row) == 3:
            lines.append("  " + "   ".join(row))
            row = []
    if row:
        lines.append("  " + "   ".join(row))

    center = []
    for color in range(NUM_COLORS):
        center.extend(tile_char(color) for _ in range(state.center[color]))
    if state.center_has_token:
        center.append(tile_char(FIRST_TOKEN))
    lines.append("  center [" + (" ".join(center) if center else "empty") + "]")
    return lines


def render(state: GameState, names: list[str]) -> str:
    header = (
        f"{BOLD if USE_COLOR else ''}Round {state.round_num}{RESET if USE_COLOR else ''}"
        f"   P{state.current} ({names[state.current]}) to move"
        f"   bag {sum(state.bag)}  discard {sum(state.discard)}"
    )
    parts = [header, ""]
    parts.extend(render_sources(state))
    parts.append("")

    left = render_board(state.players[0], 0, names[0], state.current == 0)
    right = render_board(state.players[1], 1, names[1], state.current == 1)
    for a, b in zip(left, right):
        parts.append(f"{pad(a, BOARD_WIDTH)}   {b}")
    return "\n".join(parts)


# ---------------------------------------------------------------- events


def describe_source(source: int) -> str:
    return "center" if source == CENTER else f"D{source}"


def describe_dest(dest: int) -> str:
    return "penalty row" if dest == PENALTY_DEST else f"row {dest + 1}"


def render_event(event) -> str | None:
    if isinstance(event, Draft):
        bits = [
            f"P{event.player} takes {event.count} {COLOR_NAMES[event.color]}"
            f" from {describe_source(event.source)} → {describe_dest(event.dest)}"
        ]
        if event.overflow:
            bits.append(f"{event.overflow} onto the penalty row")
        if event.to_discard:
            bits.append(f"{event.to_discard} straight to discard (penalty row full)")
        if event.took_first_token:
            bits.append("takes the first token")
        return "  " + ", ".join(bits)
    if isinstance(event, TileScored):
        detail = f"H={event.horizontal} V={event.vertical}"
        return (
            f"    P{event.player} settles {COLOR_NAMES[event.color]}"
            f" at r{event.row + 1}c{event.col + 1}: +{event.points} ({detail})"
        )
    if isinstance(event, PenaltyApplied):
        return (
            f"    P{event.player} penalty row: {event.tiles} tiles"
            f" {event.points:+d} → {event.score_after}"
        )
    if isinstance(event, RoundEnd):
        return f"  -- round {event.round_num} settled, scores {event.scores} --"
    if isinstance(event, RoundStart):
        notes = []
        if event.bag_refilled:
            notes.append("bag refilled from discard")
        if event.short_displays:
            notes.append(f"{event.short_displays} display(s) left short")
        suffix = f" ({', '.join(notes)})" if notes else ""
        return f"  == round {event.round_num} dealt, P{event.first_player} leads{suffix} =="
    if isinstance(event, BonusAwarded):
        return (
            f"    P{event.player} bonuses: {event.rows} rows, {event.columns} columns,"
            f" {event.colors} colors → +{event.points}"
        )
    if isinstance(event, GameEnd):
        if event.draw:
            return f"  == game over, draw at {event.scores} =="
        return f"  == game over, P{event.winner} wins {event.scores} =="
    return None


def print_events(events) -> None:
    for event in events:
        line = render_event(event)
        if line:
            print(line)


# ---------------------------------------------------------------- move input


COLOR_SHORTHAND = {
    "b": 0, "blue": 0,
    "y": 1, "yellow": 1,
    "r": 2, "red": 2,
    "k": 3, "black": 3,
    "w": 4, "white": 4,
}


def format_move(state: GameState, action: Action) -> str:
    p = preview(state, action)
    bits = [f"{describe_source(action.source):>6} {COLOR_NAMES[action.color]:<6}"]
    if action.dest == PENALTY_DEST:
        bits.append("-> penalty row")
    else:
        bits.append(f"-> row {action.dest + 1}")
    notes = []
    if action.dest != PENALTY_DEST:
        room = STAGING_CAPACITY[action.dest] - state.players[state.current].staging_counts[action.dest]
        notes.append(f"{p.placed}/{room} placed")
    if p.overflow:
        notes.append(f"{p.overflow} overflow")
    if p.to_discard:
        notes.append(f"{p.to_discard} discarded")
    if p.penalty_delta:
        notes.append(f"penalty {p.penalty_delta:+d}")
    if p.takes_token:
        notes.append("takes token")
    if notes:
        bits.append("(" + ", ".join(notes) + ")")
    return " ".join(bits)


def parse_shorthand(text: str, legal: list[Action]) -> Action | None:
    """Accept forms like 'd2 y 3', '2 yellow 3', 'c r f'."""
    parts = text.replace(",", " ").split()
    if len(parts) != 3:
        return None
    raw_source, raw_color, raw_dest = parts

    if raw_source in ("c", "center"):
        source = CENTER
    else:
        digits = raw_source[1:] if raw_source.startswith("d") else raw_source
        if not digits.isdigit():
            return None
        source = int(digits)

    color = COLOR_SHORTHAND.get(raw_color)
    if color is None:
        return None

    if raw_dest in ("f", "p", "penalty", "floor"):
        dest = PENALTY_DEST
    elif raw_dest.isdigit():
        dest = int(raw_dest) - 1
    else:
        return None

    action = Action(source, color, dest)
    return action if action in legal else None


HELP = """
commands:
  <n>            play move number n from the list
  d2 y 3         shorthand: display 2, yellow, staging row 3
  c r f          shorthand: center, red, dump onto the penalty row
  moves          re-print the legal moves
  board          re-print the table
  undo           take back the last move
  save FILE      write the game record to FILE
  help           this text
  quit           leave
"""


# ---------------------------------------------------------------- agents


def make_agent(name: str, rng: random.Random):
    """Returns a callable (game) -> Action.

    `ai.make_agent` owns the level roster; levels not yet implemented fall back
    to the random baseline (see docs/plans/03-ai.md).
    """
    try:
        from ai import make_agent as make_ai_agent
    except ImportError as exc:  # pragma: no cover - ai package is always present
        raise SystemExit(f"unknown agent '{name}': the ai package is unavailable") from exc
    try:
        agent = make_ai_agent(name, seed=rng.randrange(2**31))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    return lambda game: agent.choose(game.state, game.current)


# ---------------------------------------------------------------- modes


REDRAW = object()  # prompt asks the caller to re-render rather than play a move


def play(args) -> None:
    rng = random.Random(args.seed)
    game = QuadroGame(seed=args.seed)
    controllers = [args.p0, args.p1]
    agents = {
        i: make_agent(name, rng) for i, name in enumerate(controllers) if name != "human"
    }
    names = ["you" if c == "human" else c for c in controllers]
    snapshots: list[Snapshot] = []

    print(f"Quadro — seed {game.seed}")
    print_events(game.events)

    while not game.is_over():
        state = game.state
        print()
        print(render(state, names))
        print()

        legal = game.legal_actions()
        if state.current in agents:
            action = agents[state.current](game)
            print(f"  P{state.current} ({names[state.current]}) plays: {action.describe()}")
            snapshots.append(take_snapshot(game))
            print_events(game.step(action))
            continue

        for i, action in enumerate(legal):
            print(f"  [{i:>2}] {format_move(state, action)}")

        choice = prompt(game, legal, names, snapshots, agents)
        if choice is None:
            return
        if choice is REDRAW:
            continue
        snapshots.append(take_snapshot(game))
        print_events(game.step(choice))

    print()
    print(render(game.state, names))
    result = game.result()
    print()
    print(f"Final: {result.scores}  " + ("draw" if result.draw else f"P{result.winner} wins"))


class Snapshot(NamedTuple):
    state: GameState
    history: int
    events: int


def take_snapshot(game: QuadroGame) -> Snapshot:
    return Snapshot(game.state.clone(), len(game.history), len(game.events))


def rewind(game: QuadroGame, snapshots: list[Snapshot], agents: dict) -> bool:
    """Undo back to the last position a human had to decide.

    In a game against an agent, taking back one engine step would leave the
    human sitting on the agent's turn, so keep unwinding until the player to
    move is one the human controls.
    """
    if not snapshots:
        return False
    while snapshots:
        snapshot = snapshots.pop()
        game.state = snapshot.state
        game.history = game.history[: snapshot.history]
        game.events = game.events[: snapshot.events]
        if game.state.current not in agents:
            break
    return True


def prompt(
    game: QuadroGame, legal: list[Action], names, snapshots: list[Snapshot], agents: dict
):
    while True:
        try:
            raw = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return None
        if not raw:
            continue
        lowered = raw.lower()

        if lowered in ("q", "quit", "exit"):
            return None
        if lowered in ("h", "help", "?"):
            print(HELP)
            continue
        if lowered == "board":
            print(render(game.state, names))
            continue
        if lowered == "moves":
            for i, action in enumerate(legal):
                print(f"  [{i:>2}] {format_move(game.state, action)}")
            continue
        if lowered == "undo":
            if not rewind(game, snapshots, agents):
                print("  nothing to undo")
                continue
            print("  undone")
            return REDRAW
        if lowered.startswith("save"):
            parts = raw.split(maxsplit=1)
            path = parts[1] if len(parts) > 1 else "game.json"
            Path(path).write_text(json.dumps(game.to_log(mode="cli"), indent=2))
            print(f"  saved to {path}")
            continue

        if lowered.isdigit() and int(lowered) < len(legal):
            return legal[int(lowered)]
        action = parse_shorthand(lowered, legal)
        if action is not None:
            return action
        print("  no such move — type 'moves' for the list or 'help' for commands")


def auto(args) -> None:
    """Headless self-play, used to hammer the invariants."""
    wins = [0, 0]
    draws = 0
    scores = [0, 0]
    rounds = 0
    for i in range(args.games):
        seed = (args.seed or 0) + i
        rng = random.Random(seed)
        game = QuadroGame(seed=seed)
        agents = [make_agent(args.auto[0], rng), make_agent(args.auto[1], rng)]
        while not game.is_over():
            game.step(agents[game.state.current](game))
            check_invariants(game.state, seed)
        result = game.result()
        rounds += result.rounds
        scores[0] += result.scores[0]
        scores[1] += result.scores[1]
        if result.draw:
            draws += 1
        else:
            wins[result.winner] += 1

    n = args.games
    print(f"{n} games: {args.auto[0]} {wins[0]} — {wins[1]} {args.auto[1]}, {draws} draws")
    print(f"average score {scores[0] / n:.1f} vs {scores[1] / n:.1f}, {rounds / n:.1f} rounds")


def check_invariants(state: GameState, seed: int) -> None:
    census = state.tile_census()
    assert census == [TILES_PER_COLOR] * NUM_COLORS, f"seed {seed}: tiles lost {census}"
    tokens = int(state.center_has_token) + sum(p.has_first_token for p in state.players)
    assert tokens == 1, f"seed {seed}: {tokens} first tokens"
    for board in state.players:
        assert board.score >= 0, f"seed {seed}: negative score"


def replay(args) -> None:
    log = json.loads(Path(args.replay).read_text())
    game = QuadroGame(seed=log["seed"])
    names = [p.get("kind", "?") for p in log["players"]]
    print(f"Replaying {args.replay} — seed {log['seed']}")
    print_events(game.events)
    for raw in log["actions"]:
        action = Action.from_dict(raw)
        print()
        print(render(game.state, names))
        print(f"\n  next: {action.describe()}")
        try:
            input("  [enter] ")
        except (EOFError, KeyboardInterrupt):
            return
        print_events(game.step(action))
    print()
    print(render(game.state, names))
    print(f"\nFinal: {game.result().scores}")


# ---------------------------------------------------------------- entry


def main(argv: list[str] | None = None) -> None:
    global USE_COLOR

    parser = argparse.ArgumentParser(prog="quadro", description="Play Quadro in the terminal")
    parser.add_argument("--seed", type=int, default=None, help="deal seed (reproducible)")
    parser.add_argument("--p0", default="human", help="controller for player 0")
    parser.add_argument("--p1", default="human", help="controller for player 1")
    parser.add_argument("--auto", nargs=2, metavar=("P0", "P1"), help="headless self-play")
    parser.add_argument("--games", type=int, default=1, help="games to run in --auto mode")
    parser.add_argument("--replay", help="replay a saved game record")
    parser.add_argument("--no-color", action="store_true")
    args = parser.parse_args(argv)

    USE_COLOR = not args.no_color and sys.stdout.isatty()

    if args.auto:
        auto(args)
    elif args.replay:
        replay(args)
    else:
        play(args)


if __name__ == "__main__":
    main()
