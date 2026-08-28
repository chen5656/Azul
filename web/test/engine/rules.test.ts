/** Legality, previews, apply/undo — the ported equivalent of test_rules.py. */

import { describe, expect, it } from 'vitest';

import {
  Action,
  BLUE,
  CENTER,
  FIRST_TOKEN,
  PENALTY_DEST,
  PENALTY_ROW_SIZE,
  RED,
  YELLOW,
  applyAction,
  canStage,
  isLegal,
  legalActions,
  preview,
  undoAction,
} from '../../src/engine';
import { blank, fillGrid, stage } from './helpers';

describe('legality', () => {
  it('offers every staging row plus the penalty row for an available color', () => {
    const state = blank();
    state.displays[0] = [2, 0, 0, 0, 0];
    const actions = legalActions(state);
    expect(actions).toHaveLength(6); // 5 staging rows + penalty
    expect(actions.every((a) => a.source === 0 && a.color === BLUE)).toBe(true);
  });

  it('never leaves a player without a move while tiles remain', () => {
    const state = blank();
    state.displays[0] = [4, 0, 0, 0, 0];
    // Blue is settled on every grid row, so no staging row will take it.
    for (let row = 0; row < 5; row += 1) {
      state.players[0].grid[row][(BLUE + row) % 5] = true;
    }
    const actions = legalActions(state);
    expect(actions).toHaveLength(1);
    expect(actions[0].dest).toBe(PENALTY_DEST);
  });

  it('refuses a color already settled on that grid row', () => {
    const state = blank();
    fillGrid(state.players[0], [[2, (BLUE + 2) % 5]]);
    expect(canStage(state.players[0], 2, BLUE)).toBe(false);
    expect(canStage(state.players[0], 2, RED)).toBe(true);
  });

  it('refuses a second color on an occupied staging row, and a full row', () => {
    const state = blank();
    const board = state.players[0];
    stage(board, 2, BLUE, 2);
    expect(canStage(board, 2, BLUE)).toBe(true);
    expect(canStage(board, 2, RED)).toBe(false);
    stage(board, 2, BLUE, 3); // capacity of row 2
    expect(canStage(board, 2, BLUE)).toBe(false);
  });

  it('rejects actions for colors that are not in the source', () => {
    const state = blank();
    state.displays[0] = [1, 0, 0, 0, 0];
    expect(isLegal(state, new Action(0, BLUE, 0))).toBe(true);
    expect(isLegal(state, new Action(0, RED, 0))).toBe(false);
    expect(isLegal(state, new Action(CENTER, BLUE, 0))).toBe(false);
  });
});

describe('preview', () => {
  it('reports the split between the staging row and the penalty row', () => {
    const state = blank();
    state.displays[0] = [4, 0, 0, 0, 0];
    const p = preview(state, new Action(0, BLUE, 0)); // row 0 holds one tile
    expect(p).toMatchObject({ count: 4, placed: 1, overflow: 3, to_discard: 0 });
    expect(p.penalty_after).toBeLessThan(p.penalty_before);
  });

  it('counts the token against the penalty row and reports discards', () => {
    const state = blank();
    state.center = [0, 6, 0, 0, 0];
    state.center_has_token = true;
    const p = preview(state, new Action(CENTER, YELLOW, PENALTY_DEST));
    expect(p.takes_token).toBe(true);
    // One slot goes to the token, six remain: six yellows land, none discarded.
    expect(p).toMatchObject({ count: 6, placed: 0, overflow: 6, to_discard: 0 });
  });

  it('matches what applyAction actually does', () => {
    const state = blank();
    state.displays[0] = [5, 0, 0, 0, 0];
    state.players[0].penalty_tiles = [RED, RED, RED, RED, RED, RED];
    const p = preview(state, new Action(0, BLUE, 1));
    const undo = applyAction(state, new Action(0, BLUE, 1));
    expect(undo.event.placed).toBe(p.placed);
    expect(undo.event.to_discard).toBe(p.to_discard);
    expect(undo.event.overflow).toBe(p.overflow - p.to_discard);
  });
});

describe('apply and undo', () => {
  it('moves the other colors of a display to the center', () => {
    const state = blank();
    state.displays[0] = [2, 1, 1, 0, 0];
    applyAction(state, new Action(0, BLUE, 1));
    expect(state.displays[0]).toEqual([0, 0, 0, 0, 0]);
    expect(state.center).toEqual([0, 1, 1, 0, 0]);
    expect(state.current).toBe(1);
  });

  it('hands the first token to the first center taker, once', () => {
    const state = blank();
    state.center = [2, 2, 0, 0, 0];
    state.center_has_token = true;
    applyAction(state, new Action(CENTER, BLUE, 1));
    expect(state.players[0].has_first_token).toBe(true);
    expect(state.players[0].penalty_tiles).toEqual([FIRST_TOKEN]);
    expect(state.center_has_token).toBe(false);

    applyAction(state, new Action(CENTER, YELLOW, 1));
    expect(state.players[1].has_first_token).toBe(false);
  });

  it('sets the token flag even when the penalty row is already full', () => {
    const state = blank();
    state.center = [1, 0, 0, 0, 0];
    state.center_has_token = true;
    state.players[0].penalty_tiles = new Array(PENALTY_ROW_SIZE).fill(RED);
    applyAction(state, new Action(CENTER, BLUE, 0));
    expect(state.players[0].has_first_token).toBe(true);
    expect(state.players[0].penalty_tiles).toHaveLength(PENALTY_ROW_SIZE);
  });

  it('spills tiles past a full penalty row into the discard', () => {
    const state = blank();
    state.displays[0] = [4, 0, 0, 0, 0];
    state.players[0].penalty_tiles = new Array(PENALTY_ROW_SIZE - 1).fill(RED);
    const undo = applyAction(state, new Action(0, BLUE, PENALTY_DEST));
    expect(state.players[0].penalty_tiles).toHaveLength(PENALTY_ROW_SIZE);
    expect(state.players[0].penalty_overflow).toBe(3);
    expect(state.discard[BLUE]).toBe(3);
    expect(undo.event.to_discard).toBe(3);
  });

  it('restores the state exactly', () => {
    const state = blank();
    state.displays[0] = [2, 1, 1, 0, 0];
    state.center = [0, 0, 0, 1, 0];
    state.center_has_token = true;
    const before = JSON.stringify(state.toDict());

    for (const action of legalActions(state)) {
      const undo = applyAction(state, action);
      undoAction(state, undo);
      expect(JSON.stringify(state.toDict())).toBe(before);
    }
  });

  it('agrees with clone-and-apply', () => {
    const state = blank();
    state.displays[0] = [2, 2, 0, 0, 0];
    state.center = [0, 0, 3, 0, 0];
    state.center_has_token = true;

    for (const action of legalActions(state)) {
      const cloned = state.clone();
      applyAction(cloned, action);
      const undo = applyAction(state, action);
      expect(state.toDict()).toEqual(cloned.toDict());
      undoAction(state, undo);
    }
  });
});
