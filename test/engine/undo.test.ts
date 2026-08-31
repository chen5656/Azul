import { describe, expect, it } from 'vitest';
import { QuadroGame } from '../../src/engine';
import config from '../../src/config';

describe('QuadroGame undo and clone', () => {
  it('clones game state and history accurately', () => {
    const game = new QuadroGame(12345, 0);
    const initialActions = game.legalActions();
    expect(initialActions.length).toBeGreaterThan(0);

    const firstAction = initialActions[0];
    game.step(firstAction);

    const cloned = game.clone();
    expect(cloned.seed).toBe(game.seed);
    expect(cloned.history.length).toBe(1);
    expect(cloned.history[0].equals(firstAction)).toBe(true);
    expect(cloned.state.round_num).toBe(game.state.round_num);
    expect(cloned.state.current).toBe(game.state.current);
    expect(cloned.events.length).toBe(game.events.length);
  });

  it('loads maxUndos = 3 from config.json', () => {
    expect(config.maxUndos).toBe(3);
  });
});
