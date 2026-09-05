import { describe, expect, it } from 'vitest';
import { Action, BLUE, CENTER, GameState, RED, Rng, YELLOW, QuadroGame } from '../../src/engine';
import { ExpertRuleAgent } from '../../src/ai/expertAgent';

describe('ExpertRuleAgent (Scheme A)', () => {
  it('prioritizes completing Row 5 over Row 4 when both can be completed this round', () => {
    const state = new GameState(new Rng(42));
    state.center = [0, 0, 0, 0, 0];
    state.center_has_token = false;
    for (let i = 0; i < 5; i += 1) state.displays[i] = [0, 0, 0, 0, 0];

    // Display 0 has 1 BLUE tile
    state.displays[0][BLUE] = 1;
    // Display 1 has 1 RED tile
    state.displays[1][RED] = 1;

    // Player 0: Row 5 (dest 4) is 4/5 BLUE; Row 4 (dest 3) is 3/4 RED
    state.players[0].staging_colors[4] = BLUE;
    state.players[0].staging_counts[4] = 4;

    state.players[0].staging_colors[3] = RED;
    state.players[0].staging_counts[3] = 3;

    const agent = new ExpertRuleAgent(100);
    const chosen = agent.choose(state, 0);

    // Both can be completed, so Row 5 (dest 4) takes priority over Row 4 (dest 3)
    expect(chosen.dest).toBe(4);
    expect(chosen.color).toBe(BLUE);
  });

  it('prioritizes completing Row 3 over NOT completing Row 5', () => {
    const state = new GameState(new Rng(42));
    state.center = [0, 0, 0, 0, 0];
    state.center_has_token = false;
    for (let i = 0; i < 5; i += 1) state.displays[i] = [0, 0, 0, 0, 0];

    // Display 0 has 1 BLUE tile, Display 1 has 1 RED tile
    state.displays[0][BLUE] = 1;
    state.displays[1][RED] = 1;

    // Player 0:
    // Row 5 (dest 4) is 0/5 BLUE (taking 1 BLUE does NOT complete it!)
    // Row 3 (dest 2) is 2/3 RED (taking 1 RED DOES complete it!)
    state.players[0].staging_colors[4] = -1;
    state.players[0].staging_counts[4] = 0;

    state.players[0].staging_colors[2] = RED;
    state.players[0].staging_counts[2] = 2;

    const agent = new ExpertRuleAgent(100);
    const chosen = agent.choose(state, 0);

    // Row 3 must be completed rather than putting a lonely tile into Row 5
    expect(chosen.dest).toBe(2);
    expect(chosen.color).toBe(RED);
  });

  it('prioritizes completing direct endgame bonus (Column/Color) over regular row completion', () => {
    const state = new GameState(new Rng(42));
    state.center = [0, 0, 0, 0, 0];
    state.center_has_token = false;
    for (let i = 0; i < 5; i += 1) state.displays[i] = [0, 0, 0, 0, 0];

    state.displays[0][BLUE] = 1;
    state.displays[1][RED] = 1;

    // Dest 4 has 4/5 BLUE (regular row 5 completion, no column completed)
    state.players[0].staging_colors[4] = BLUE;
    state.players[0].staging_counts[4] = 4;

    // Dest 2 has 2/3 RED. Settle col for RED at row 2 completes full column!
    const targetCol = (RED + 2) % 5;
    for (let r = 0; r < 5; r += 1) {
      if (r !== 2) state.players[0].grid[r][targetCol] = true;
    }
    state.players[0].staging_colors[2] = RED;
    state.players[0].staging_counts[2] = 2;

    const agent = new ExpertRuleAgent(100);
    const chosen = agent.choose(state, 0);

    // RED completes a full column (+7 bonus), out-prioritizing regular row 5
    expect(chosen.dest).toBe(2);
    expect(chosen.color).toBe(RED);
  });

  it('guarantees determinism for identical seed and state', () => {
    const game = new QuadroGame(123);
    const agentA = new ExpertRuleAgent(777);
    const agentB = new ExpertRuleAgent(777);

    const moveA = agentA.choose(game.state, 0);
    const moveB = agentB.choose(game.state, 0);

    expect(moveA.actionId).toBe(moveB.actionId);
  });
});
