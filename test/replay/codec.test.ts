/**
 * Wire-format contract for shared replays.
 *
 * Codes travel in URLs that outlive the build that produced them, so the
 * format's constants are pinned here: a change that silently reorders
 * `REPLAY_AI_LEVELS` or moves a header byte breaks every link already shared.
 */

import { describe, expect, it } from 'vitest';

import { MctsAgent } from '../../src/ai';
import { QuadroGame } from '../../src/engine';
import {
  MAX_ACTIONS,
  REPLAY_AI_LEVELS,
  ReplayDecodeError,
  decodeReplay,
  encodeReplay,
} from '../../src/replay/codec';
import { ENGINE_VERSION } from '../../src/replay/version';
import { ReplayMismatch, verifyReplay } from '../../src/replay/rebuild';

const base = {
  engineVersion: ENGINE_VERSION,
  seed: 0xdeadbeef,
  firstPlayer: 1,
  humanSeat: 1,
  aiLevel: 'extreme' as const,
  scores: [42, 37] as [number, number],
  puzzleId: '2026-09-01',
  actions: [0, 17, 179, 88],
};

describe('encode/decode round trip', () => {
  it('preserves every field', () => {
    expect(decodeReplay(encodeReplay(base), ENGINE_VERSION)).toEqual(base);
  });

  it('handles a Practice replay with no date', () => {
    const practice = { ...base, puzzleId: null };
    expect(decodeReplay(encodeReplay(practice), ENGINE_VERSION)).toEqual(practice);
  });

  it('round-trips every level', () => {
    for (const aiLevel of REPLAY_AI_LEVELS) {
      expect(decodeReplay(encodeReplay({ ...base, aiLevel }), ENGINE_VERSION).aiLevel).toBe(aiLevel);
    }
  });

  it('round-trips both seat assignments', () => {
    for (const firstPlayer of [0, 1]) {
      for (const humanSeat of [0, 1]) {
        const out = decodeReplay(encodeReplay({ ...base, firstPlayer, humanSeat }), ENGINE_VERSION);
        expect([out.firstPlayer, out.humanSeat]).toEqual([firstPlayer, humanSeat]);
      }
    }
  });

  it('keeps a seed above 2^31 unsigned', () => {
    expect(decodeReplay(encodeReplay({ ...base, seed: 0xffffffff }), ENGINE_VERSION).seed).toBe(
      0xffffffff,
    );
  });

  it('produces a URL-safe code short enough to share', () => {
    const code = encodeReplay({ ...base, actions: new Array(90).fill(7) });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(160);
  });
});

describe('decode rejects rather than guesses', () => {
  it('refuses a replay from another engine version', () => {
    const code = encodeReplay({ ...base, engineVersion: ENGINE_VERSION + 1 });
    expect(() => decodeReplay(code, ENGINE_VERSION)).toThrow(
      expect.objectContaining({ code: 'ENGINE_MISMATCH', foundVersion: ENGINE_VERSION + 1 }),
    );
  });

  it('refuses an unknown format tag', () => {
    const bytes = new Uint8Array(9);
    bytes[0] = 99;
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeReplay(code, ENGINE_VERSION)).toThrow(
      expect.objectContaining({ code: 'BAD_FORMAT' }),
    );
  });

  it.each([['not base64!!'], ['AAAA'], ['']])('refuses malformed input %s', (code) => {
    expect(() => decodeReplay(code, ENGINE_VERSION)).toThrow(ReplayDecodeError);
  });

  it('refuses a code longer than a game can be', () => {
    expect(() => encodeReplay({ ...base, actions: new Array(MAX_ACTIONS + 1).fill(1) })).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }),
    );
  });
});

describe('verifyReplay', () => {
  /** A real finished game, so the assertions run against a legal move stream. */
  function playOut(seed: number) {
    const game = new QuadroGame(seed, 0);
    const agent = new MctsAgent({ seed: 5, simulations: 20 });
    while (!game.isOver()) game.step(agent.choose(game.state, game.state.current));
    return game;
  }

  it('reproduces the scores a real game ended on', () => {
    const game = playOut(555);
    const replay = {
      ...base,
      seed: 555,
      firstPlayer: game.state.first_player,
      scores: [game.state.players[0].score, game.state.players[1].score] as [number, number],
      actions: game.history.map((a) => a.actionId),
    };
    const verdict = verifyReplay(decodeReplay(encodeReplay(replay), ENGINE_VERSION), {
      checkScores: true,
    });
    expect(verdict.scores).toEqual(replay.scores);
    expect(verdict.timeline).toHaveLength(replay.actions.length);
  });

  it('rejects a tampered move stream', () => {
    const game = playOut(777);
    const actions = game.history.map((a) => a.actionId);
    // Swapping two moves almost always makes one of them illegal; if it stays
    // legal the game no longer ends where it claimed to.
    [actions[1], actions[4]] = [actions[4], actions[1]];
    const replay = {
      ...base,
      seed: 777,
      firstPlayer: game.state.first_player,
      scores: [game.state.players[0].score, game.state.players[1].score] as [number, number],
      actions,
    };
    expect(() => verifyReplay(replay, { checkScores: true })).toThrow(ReplayMismatch);
  });

  it('rejects a claimed score the moves do not produce', () => {
    const game = playOut(888);
    const replay = {
      ...base,
      seed: 888,
      firstPlayer: game.state.first_player,
      scores: [1, 2] as [number, number],
      actions: game.history.map((a) => a.actionId),
    };
    expect(() => verifyReplay(replay, { checkScores: true })).toThrow(
      expect.objectContaining({ code: 'SCORE_MISMATCH' }),
    );
  });

  it('rejects a replay that stops before the game ends', () => {
    const game = playOut(999);
    const replay = {
      ...base,
      seed: 999,
      firstPlayer: game.state.first_player,
      actions: game.history.slice(0, 5).map((a) => a.actionId),
    };
    expect(() => verifyReplay(replay)).toThrow(expect.objectContaining({ code: 'SHORT' }));
  });
});
