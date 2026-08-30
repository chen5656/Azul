/** Level 0 — uniform random legal action. The baseline every other level beats. */

import { type Action, type GameState, Rng, legalActions } from '../engine';
import { type Agent, AgentError, choice } from './base';

export class RandomAgent implements Agent {
  readonly level = 'random' as const;
  private readonly rng: Rng;

  constructor(seed?: number) {
    this.rng = new Rng(seed);
  }

  choose(state: GameState, _player: number): Action {
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    return choice(this.rng, actions);
  }
}
