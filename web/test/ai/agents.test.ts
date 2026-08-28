/**
 * Agent behavior contracts. Move *choice* is deliberately not asserted against
 * Python (BUILD-SPEC §14.6 — equal-valued ties break on iteration order); the
 * strength ordering is asserted statistically by `test/strength.bench.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  Action,
  GameState,
  QuadroGame,
  Rng,
  isLegal,
  legalActions,
} from '../../src/engine';
import {
  DEFAULT_WEIGHTS,
  GreedyAgent,
  LEVELS,
  MctsAgent,
  MinimaxAgent,
  RandomAgent,
  actionValue,
  availableLevels,
  evaluate,
  makeAgent,
  sideValue,
} from '../../src/ai';

const AGENTS = () => [
  new RandomAgent(1),
  new GreedyAgent(1),
  new MinimaxAgent(1, 4, 0.05),
  new MctsAgent({ seed: 1, timeBudget: 0.05 }),
];

describe('evaluate', () => {
  it('is zero-sum', () => {
    const game = new QuadroGame(9);
    const rng = new Rng(4);
    for (let i = 0; i < 12; i += 1) {
      const actions = game.legalActions();
      game.step(actions[rng.nextInt(actions.length)]);
      expect(evaluate(game.state, 0)).toBeCloseTo(-evaluate(game.state, 1), 12);
    }
  });

  it('prefers a filling staging row over dumping to the penalty row', () => {
    const state = new GameState(new Rng(0));
    state.bag = [0, 0, 0, 0, 0];
    state.displays[0] = [2, 0, 0, 0, 0];
    const stage = actionValue(state, new Action(0, 0, 1), 0);
    const dump = actionValue(state, new Action(0, 0, 5), 0);
    expect(stage).toBeGreaterThan(dump);
  });

  it('scores a settled grid above an empty one', () => {
    const empty = new GameState(new Rng(0));
    const filled = new GameState(new Rng(0));
    filled.players[0].grid[0][0] = true;
    filled.players[0].score = 5;
    expect(sideValue(filled, 0, DEFAULT_WEIGHTS)).toBeGreaterThan(
      sideValue(empty, 0, DEFAULT_WEIGHTS),
    );
  });
});

describe('every agent', () => {
  for (const agent of AGENTS()) {
    it(`${agent.level} returns a legal action and leaves the state untouched`, () => {
      const game = new QuadroGame(15);
      const before = JSON.stringify(game.state.toDict(true));
      const action = agent.choose(game.state, game.state.current);
      expect(isLegal(game.state, action)).toBe(true);
      expect(JSON.stringify(game.state.toDict(true))).toBe(before);
    });

    it(`${agent.level} plays a full game to a legal finish`, () => {
      const game = new QuadroGame(23);
      while (!game.isOver()) game.step(agent.choose(game.state, game.state.current));
      const result = game.result();
      expect(result.scores.every((s) => s >= 0)).toBe(true);
      expect(game.state.players.some((p) => p.hasCompleteRow())).toBe(true);
    });

    it(`${agent.level} takes the only move when there is one`, () => {
      const state = new GameState(new Rng(0));
      state.bag = [0, 0, 0, 0, 0];
      state.center_has_token = false;
      state.displays[0] = [4, 0, 0, 0, 0];
      for (let row = 0; row < 5; row += 1) state.players[0].grid[row][row] = true;
      const only = legalActions(state);
      expect(only).toHaveLength(1);
      expect(agent.choose(state, 0).actionId).toBe(only[0].actionId);
    });
  }
});

describe('search budgets (FR-009)', () => {
  it('minimax returns a legal action with a budget of zero', () => {
    const game = new QuadroGame(31);
    const agent = new MinimaxAgent(2, 4, 0);
    expect(isLegal(game.state, agent.choose(game.state, 0))).toBe(true);
  });

  it('mcts returns a legal action with a budget of zero', () => {
    const game = new QuadroGame(31);
    const agent = new MctsAgent({ seed: 2, timeBudget: 0 });
    expect(agent.simulations).toBe(0);
    expect(isLegal(game.state, agent.choose(game.state, 0))).toBe(true);
  });

  it('minimax deepens when given time', () => {
    const game = new QuadroGame(31);
    const agent = new MinimaxAgent(2, 4, 0.45);
    agent.choose(game.state, 0);
    expect(agent.reachedDepth).toBeGreaterThanOrEqual(2);
    expect(agent.nodes).toBeGreaterThan(0);
  });

  it('mcts runs simulations when given time', () => {
    const game = new QuadroGame(31);
    const agent = new MctsAgent({ seed: 2, timeBudget: 0.2 });
    agent.choose(game.state, 0);
    expect(agent.simulations).toBeGreaterThan(0);
  });
});

describe('registry', () => {
  it('exposes exactly the four classic levels (FR-007)', () => {
    expect(availableLevels()).toEqual(['random', 'greedy', 'minimax', 'mcts']);
    expect(LEVELS).not.toContain('azulzero');
  });

  it('builds an agent for every level', () => {
    for (const level of availableLevels()) {
      expect(makeAgent(level, 1).level).toBe(level);
    }
  });

  it('gives the mcts level the Daily budget of 450ms (AC-012)', () => {
    const agent = makeAgent('mcts', 1) as MctsAgent;
    expect(agent.level).toBe('mcts');
    const game = new QuadroGame(1);
    const started = performance.now();
    agent.choose(game.state, 0);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThan(300);
    expect(elapsed).toBeLessThan(900);
  });
});
