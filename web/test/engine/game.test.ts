/** The QuadroGame driver: dealing, round boundaries, determinism, serialization. */

import { describe, expect, it } from 'vitest';

import {
  Action,
  DISPLAY_SIZE,
  GameState,
  IllegalAction,
  NUM_COLORS,
  NUM_DISPLAYS,
  QuadroGame,
  Rng,
  TILES_PER_COLOR,
  drawTile,
  isLegal,
  startRound,
} from '../../src/engine';

function playRandom(seed: number, moveSeed = seed): QuadroGame {
  const game = new QuadroGame(seed);
  const rng = new Rng(moveSeed);
  while (!game.isOver()) {
    const actions = game.legalActions();
    game.step(actions[rng.nextInt(actions.length)]);
  }
  return game;
}

describe('dealing', () => {
  it('fills every display to four and keeps the census at 20 per color', () => {
    const game = new QuadroGame(7);
    for (const display of game.state.displays) {
      expect(display.reduce((a, b) => a + b, 0)).toBe(DISPLAY_SIZE);
    }
    expect(game.state.tileCensus()).toEqual(new Array(NUM_COLORS).fill(TILES_PER_COLOR));
    expect(game.state.center_has_token).toBe(true);
  });

  it('refills the bag from the discard pile when it runs dry', () => {
    const state = new GameState(new Rng(1));
    state.bag = new Array(NUM_COLORS).fill(0);
    state.discard = [4, 0, 0, 0, 0];
    const event = startRound(state);
    expect(event.bag_refilled).toBe(true);
    expect(state.displays[0][0]).toBe(DISPLAY_SIZE);
    expect(state.discard).toEqual(new Array(NUM_COLORS).fill(0));
  });

  it('leaves displays short when bag and discard are both empty', () => {
    const state = new GameState(new Rng(1));
    state.bag = [2, 0, 0, 0, 0];
    state.discard = new Array(NUM_COLORS).fill(0);
    const event = startRound(state);
    expect(event.short_displays).toBe(NUM_DISPLAYS);
    expect(drawTile(state)).toBeNull();
  });
});

describe('driving', () => {
  it('rejects an illegal action without changing the state', () => {
    const game = new QuadroGame(3);
    const before = JSON.stringify(game.state.toDict());
    const illegal = Array.from({ length: 180 }, (_, id) => Action.fromId(id)).find(
      (a) => !isLegal(game.state, a),
    )!;
    expect(() => game.step(illegal)).toThrow(IllegalAction);
    expect(JSON.stringify(game.state.toDict())).toBe(before);
  });

  it('settles and deals a new round when the table empties', () => {
    const game = new QuadroGame(11);
    while (game.state.round_num === 1 && !game.isOver()) {
      game.step(game.legalActions()[0]);
    }
    if (!game.isOver()) {
      expect(game.state.round_num).toBe(2);
      expect(game.events.some((e) => e.kind === 'round_start' && e.round_num === 2)).toBe(true);
      expect(game.state.current).toBe(game.state.first_player);
    }
  });

  it('gives the next round to whoever took the first token', () => {
    const game = new QuadroGame(5);
    while (game.state.round_num === 1 && !game.isOver()) {
      game.step(game.legalActions()[0]);
    }
    if (!game.isOver()) {
      const roundStart = game.events.filter((e) => e.kind === 'round_start').at(-1)!;
      expect(roundStart.first_player).toBe(game.state.first_player);
    }
  });

  it('rejects any action once the game is over', () => {
    const game = playRandom(21);
    expect(() => game.step(new Action(0, 0, 0))).toThrow(IllegalAction);
    expect(game.legalActions()).toEqual([]);
  });
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const a = playRandom(2024, 1);
    const b = playRandom(2024, 1);
    expect(a.history.map((x) => x.actionId)).toEqual(b.history.map((x) => x.actionId));
    expect(a.state.toDict()).toEqual(b.state.toDict());
    expect(a.result()).toEqual(b.result());
  });

  it('deals differently from different seeds', () => {
    expect(new QuadroGame(1).state.displays).not.toEqual(new QuadroGame(2).state.displays);
  });
});

describe('serialization', () => {
  it('round-trips a mid-game state losslessly', () => {
    const game = new QuadroGame(77);
    const rng = new Rng(3);
    for (let i = 0; i < 25 && !game.isOver(); i += 1) {
      const actions = game.legalActions();
      game.step(actions[rng.nextInt(actions.length)]);
    }

    const d = game.state.toDict(true);
    const restored = GameState.fromDict(d);
    expect(restored.toDict(true)).toEqual(d);
    // The restored rng continues the same sequence.
    expect([0, 1, 2, 3, 4].map(() => restored.rng.next())).toEqual(
      [0, 1, 2, 3, 4].map(() => game.state.rng.next()),
    );
  });
});
