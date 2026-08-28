/**
 * Daily puzzle derivation: the New York day boundary (AC-009, AC-011) and the
 * deterministic deal (AC-010, FR-016).
 */

import { describe, expect, it } from 'vitest';

import { GameState, fnv1a32 } from '../../src/engine';
import {
  HUMAN_SEAT,
  agentSeedForPuzzle,
  newDailyGame,
  nextRolloverMs,
  puzzleIdFor,
  seedForPuzzle,
} from '../../src/daily/puzzle';

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('hashes UTF-8 bytes, not UTF-16 code units', () => {
    // 'é' is one code unit but two UTF-8 bytes, 0xC3 0xA9.
    let hash = 0x811c9dc5;
    for (const byte of [0xc3, 0xa9]) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    expect(fnv1a32('é')).toBe(hash);
  });

  it('returns an unsigned 32-bit integer', () => {
    const seed = fnv1a32('quadro-daily-v1:2026-08-28');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});

describe('puzzle id', () => {
  it('is the New York calendar date, not the UTC one', () => {
    // 03:30 UTC on the 29th is 23:30 on the 28th in New York (EDT, UTC-4).
    expect(puzzleIdFor(new Date('2026-08-29T03:30:00Z'))).toBe('2026-08-28');
    // 04:30 UTC has already rolled over.
    expect(puzzleIdFor(new Date('2026-08-29T04:30:00Z'))).toBe('2026-08-29');
  });

  it('is correct across the spring-forward boundary (AC-011)', () => {
    // 2026-03-08: EST (UTC-5) becomes EDT (UTC-4) at 02:00 local.
    expect(puzzleIdFor(new Date('2026-03-08T04:59:00Z'))).toBe('2026-03-07');
    expect(puzzleIdFor(new Date('2026-03-08T05:01:00Z'))).toBe('2026-03-08');
    expect(puzzleIdFor(new Date('2026-03-09T03:59:00Z'))).toBe('2026-03-08');
    expect(puzzleIdFor(new Date('2026-03-09T04:01:00Z'))).toBe('2026-03-09');
  });

  it('is correct across the fall-back boundary (AC-011)', () => {
    // 2026-11-01: EDT (UTC-4) becomes EST (UTC-5) at 02:00 local.
    expect(puzzleIdFor(new Date('2026-11-01T03:59:00Z'))).toBe('2026-10-31');
    expect(puzzleIdFor(new Date('2026-11-01T04:01:00Z'))).toBe('2026-11-01');
    expect(puzzleIdFor(new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01');
    expect(puzzleIdFor(new Date('2026-11-02T05:01:00Z'))).toBe('2026-11-02');
  });

  it('changes exactly once across midnight New York (AC-009)', () => {
    const before = new Date('2026-08-29T03:59:59Z'); // 23:59:59 on the 28th
    const after = new Date('2026-08-29T04:00:01Z'); // 00:00:01 on the 29th
    expect(puzzleIdFor(before)).toBe('2026-08-28');
    expect(puzzleIdFor(after)).toBe('2026-08-29');
    expect(seedForPuzzle(puzzleIdFor(before))).not.toBe(seedForPuzzle(puzzleIdFor(after)));
  });
});

describe('rollover', () => {
  it('lands on the next New York midnight, to the second', () => {
    const at = new Date('2026-08-28T15:00:00Z');
    const rollover = new Date(nextRolloverMs(at));
    expect(puzzleIdFor(new Date(rollover.getTime() - 2000))).toBe('2026-08-28');
    expect(puzzleIdFor(rollover)).toBe('2026-08-29');
  });

  it('is 23 hours on the spring-forward day, not 24', () => {
    const at = new Date('2026-03-08T05:01:00Z'); // just after midnight local
    const hours = (nextRolloverMs(at) - at.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(22.9);
    expect(hours).toBeLessThan(23.1);
  });

  it('is 25 hours on the fall-back day', () => {
    const at = new Date('2026-11-01T04:01:00Z');
    const hours = (nextRolloverMs(at) - at.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(24.9);
    expect(hours).toBeLessThan(25.1);
  });
});

describe('the daily deal', () => {
  it('derives the seed exactly as BR-002 specifies', () => {
    expect(seedForPuzzle('2026-08-28')).toBe(fnv1a32('quadro-daily-v1:2026-08-28'));
    expect(agentSeedForPuzzle('2026-08-28')).toBe(
      (seedForPuzzle('2026-08-28') ^ 0x9e3779b9) >>> 0,
    );
  });

  it('deals the same initial state every time for one puzzle id (AC-010)', () => {
    const a = newDailyGame('2026-08-28').state.toDict(true);
    const b = newDailyGame('2026-08-28').state.toDict(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Byte-identical after a round trip too, which is what the cross-browser
    // check compares.
    expect(JSON.stringify(GameState.fromDict(a).toDict(true))).toBe(JSON.stringify(a));
  });

  it('deals differently on different days', () => {
    expect(newDailyGame('2026-08-28').state.displays).not.toEqual(
      newDailyGame('2026-08-29').state.displays,
    );
  });

  it('seats the human first (A-001, BR-003)', () => {
    const game = newDailyGame('2026-08-28');
    expect(game.state.first_player).toBe(HUMAN_SEAT);
    expect(game.state.current).toBe(HUMAN_SEAT);
  });
});
