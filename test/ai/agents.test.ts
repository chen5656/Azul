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
  EASY_EPSILON,
  EXTREME_STEPS_BY_ROUND,
  GreedyAgent,
  LEVELS,
  MctsAgent,
  MINIMAX_DEPTHS,
  MINIMAX_WIDTHS,
  MinimaxAgent,
  actionValue,
  availableLevels,
  evaluate,
  extremeSteps,
  makeAgent,
  sideValue,
} from '../../src/ai';

const AGENTS = () => [
  new GreedyAgent(1, EASY_EPSILON),
  new MinimaxAgent(1, 2, 50, undefined, 'medium', 20),
  new MinimaxAgent(1, 3, 50, undefined, 'hard', 16),
  new MinimaxAgent(1, 4, 50, undefined, 'expert', 12),
  new MinimaxAgent(1, 5, 50, undefined, 'master', 8),
  new MctsAgent({ seed: 1, simulations: 24 }),
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
  it('minimax still returns a legal action when the safety cap trips at once', () => {
    const game = new QuadroGame(31);
    const agent = new MinimaxAgent(2, 4, 0);
    expect(isLegal(game.state, agent.choose(game.state, 0))).toBe(true);
    expect(agent.cappedOut).toBe(true);
  });

  it('mcts still returns a legal action when the safety cap trips at once', () => {
    const game = new QuadroGame(31);
    const agent = new MctsAgent({ seed: 2, safetyCapMs: 0 });
    expect(isLegal(game.state, agent.choose(game.state, 0))).toBe(true);
    expect(agent.simulations).toBe(0);
    expect(agent.cappedOut).toBe(true);
  });

  it('minimax reaches its full depth, cap or no cap', () => {
    const game = new QuadroGame(31);
    const agent = new MinimaxAgent(2, 2);
    agent.choose(game.state, 0);
    expect(agent.reachedDepth).toBe(2);
    expect(agent.cappedOut).toBe(false);
    expect(agent.nodes).toBeGreaterThan(0);
  });

  it('mcts spends exactly its simulation budget, not a slice of clock', () => {
    const game = new QuadroGame(31);
    const agent = new MctsAgent({ seed: 2, simulations: 40 });
    agent.choose(game.state, 0);
    expect(agent.simulations).toBe(40);
    expect(agent.cappedOut).toBe(false);
  });

  it('gives the same move however fast the machine is (the whole point)', () => {
    const game = new QuadroGame(31);
    const first = new MctsAgent({ seed: 5, simulations: 40 }).choose(game.state, 0);
    const second = new MctsAgent({ seed: 5, simulations: 40 }).choose(game.state, 0);
    expect(second.actionId).toBe(first.actionId);
  });
});

describe('determinism', () => {
  // One attempt must be reproducible end to end: the same agent, asked the
  // same question twice, answers the same way. (Across attempts the opponent
  // seed is redrawn — see `randomAgentSeed` — so this is a claim about a fixed
  // seed, not about a fixed puzzle.) That has to hold
  // across a restart, an undo, a discarded speculative search and a rebuilt
  // worker — none of which an agent can see — so `choose` is a function of the
  // position, not of how many times this agent has been asked something.
  const positions = () => {
    const game = new QuadroGame(23);
    const seen: GameState[] = [game.state.clone()];
    const rng = new Rng(5);
    for (let i = 0; i < 6; i += 1) {
      const actions = game.legalActions();
      game.step(actions[rng.nextInt(actions.length)]);
      if (game.isOver()) break;
      seen.push(game.state.clone());
    }
    return seen;
  };

  it.each(availableLevels())('%s answers a position the same way every time', (level) => {
    const states = positions();
    const fresh = makeAgent(level, 99);
    const expected = states.map((s) => fresh.choose(s, s.current).actionId);

    // The same agent, asked out of order and with the questions repeated.
    const reused = makeAgent(level, 99);
    for (const [i, state] of [...states.entries()].reverse()) {
      expect(reused.choose(state, state.current).actionId).toBe(expected[i]);
      expect(reused.choose(state, state.current).actionId).toBe(expected[i]);
    }

    // And a rebuilt agent, as an undo or a restarted worker would produce.
    for (const [i, state] of states.entries()) {
      expect(makeAgent(level, 99).choose(state, state.current).actionId).toBe(expected[i]);
    }
  });

  it('separates agents that differ only by seed', () => {
    const game = new QuadroGame(23);
    const moves = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => makeAgent('easy', seed).choose(game.state, 0).actionId),
    );
    // Not a strong claim — just that the position hash has not collapsed the
    // seed out of the derivation.
    expect(moves.size).toBeGreaterThan(1);
  });
});

describe('registry', () => {
  it('exposes exactly the six difficulty levels, weakest first (FR-007)', () => {
    expect(availableLevels()).toEqual(['easy', 'medium', 'hard', 'expert', 'master', 'extreme']);
    expect(LEVELS).not.toContain('azulzero');
  });

  it('separates the alpha-beta levels by depth, and narrows only the deepest', () => {
    expect(MINIMAX_DEPTHS).toEqual({ medium: 2, hard: 3, expert: 4, master: 5 });
    // Full width is strength; only `master` trades it away to afford depth 5.
    expect(MINIMAX_WIDTHS).toEqual({ master: 8 });
  });

  it('builds an agent for every level', () => {
    for (const level of availableLevels()) {
      expect(makeAgent(level, 1).level).toBe(level);
    }
  });

  it('gives the extreme level a work budget, not a clock (AC-012)', () => {
    const agent = makeAgent('extreme', 1) as MctsAgent;
    expect(agent.level).toBe('extreme');
    const game = new QuadroGame(1);
    agent.choose(game.state, 0);
    // Whatever the machine, the level did the same amount of thinking. It
    // overshoots by at most the last simulation, which cannot be split.
    expect(agent.steps).toBeGreaterThanOrEqual(EXTREME_STEPS_BY_ROUND[0]);
    expect(agent.simulations).toBeGreaterThan(0);
    expect(agent.cappedOut).toBe(false);
  });

  it('spends more on the endgame, where the search actually converges', () => {
    const table = EXTREME_STEPS_BY_ROUND;
    for (let i = 1; i < table.length; i += 1) expect(table[i]).toBeGreaterThan(table[i - 1]);
    expect(extremeSteps(1)).toBe(table[0]);
    expect(extremeSteps(table.length)).toBe(table[table.length - 1]);
    // Past the end of the schedule the last entry stands.
    expect(extremeSteps(99)).toBe(table[table.length - 1]);
    expect(extremeSteps(0)).toBe(table[0]);
  });
});
