/**
 * The load-bearing invariant behind replays.
 *
 * A replay stores a seed and a list of actions and rebuilds every board by
 * re-running the engine. That only works because the *deal* is reproducible,
 * which in turn requires that nothing but `drawTile` ever advances
 * `GameState.rng`. The agents search on clones and install their own `Rng`
 * there (`MctsAgent.simulate`), so a search leaves the live stream untouched.
 *
 * If someone later reaches for `state.rng` inside an agent to save allocating
 * one, every shared replay silently desynchronises and renders a game that was
 * never played. That is invisible in normal play and near-impossible to debug
 * from a bug report, so it is pinned here.
 */

import { describe, expect, it } from 'vitest';

import { Action, QuadroGame } from '../../src/engine';
import { GreedyAgent, MctsAgent, MinimaxAgent } from '../../src/ai';

const agents = () => [
  new GreedyAgent(1, 0.1),
  new MinimaxAgent(1, 2, 0.05),
  new MctsAgent({ seed: 7, simulations: 40 }),
];

describe('agents never consume the live RNG', () => {
  for (const agent of agents()) {
    it(`${agent.constructor.name} leaves state.rng untouched`, () => {
      const game = new QuadroGame(12345, 0);
      const before = game.state.rng.state;
      agent.choose(game.state, game.state.current);
      expect(game.state.rng.state).toBe(before);
    });
  }

  it('a whole game only advances the RNG inside drawTile', () => {
    const game = new QuadroGame(999, 0);
    const agent = new MctsAgent({ seed: 3, simulations: 25 });
    let rounds = game.state.round_num;

    while (!game.isOver()) {
      const before = game.state.rng.state;
      const move = agent.choose(game.state, game.state.current);
      // Searching is not allowed to move the stream at all.
      expect(game.state.rng.state).toBe(before);
      game.step(move);
      // Stepping may move it, but only when a new round was dealt.
      if (game.state.round_num === rounds && !game.isOver()) {
        expect(game.state.rng.state).toBe(before);
      }
      rounds = game.state.round_num;
    }
  });
});

describe('a game is reproducible from seed plus actions', () => {
  it('replaying an agent-vs-agent game reaches the identical final state', () => {
    const played = new QuadroGame(2024, 0);
    const a = new MctsAgent({ seed: 11, simulations: 30 });
    const b = new MinimaxAgent(1, 2, 0.05);

    while (!played.isOver()) {
      const agent = played.state.current === 0 ? a : b;
      played.step(agent.choose(played.state, played.state.current));
    }

    // No agent involved this time: the recorded actions are replayed directly.
    const rerun = new QuadroGame(2024, 0);
    for (const action of played.history) {
      rerun.step(new Action(action.source, action.color, action.dest));
    }

    expect(rerun.state.toDict(true)).toEqual(played.state.toDict(true));
    expect(rerun.result()).toEqual(played.result());
  });

  it('the same seed deals the same opening', () => {
    const a = new QuadroGame(4242, 0);
    const b = new QuadroGame(4242, 0);
    expect(a.state.toDict(true)).toEqual(b.state.toDict(true));
  });
});
