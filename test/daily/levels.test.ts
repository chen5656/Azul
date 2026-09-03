/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL, dailyHrefFor, resolveDailyLevel } from '../../src/daily/levels';
import { storage } from '../../src/storage';

describe('resolveDailyLevel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('falls back to the default for a player who has never chosen', () => {
    expect(resolveDailyLevel('')).toBe(DEFAULT_LEVEL);
  });

  it('hands a returning player the opponent they last played', () => {
    storage.setDailyLevel('master');
    expect(resolveDailyLevel('')).toBe('master');
  });

  it('lets the URL override what the device remembers', () => {
    storage.setDailyLevel('master');
    expect(resolveDailyLevel('?ai=hard')).toBe('hard');
  });

  it('ignores a remembered value that is no longer a level', () => {
    storage.setDailyLevel('impossible');
    expect(resolveDailyLevel('')).toBe(DEFAULT_LEVEL);
  });

  it('round-trips an explicit choice of the default level', () => {
    // The whole point of writing `?ai=easy` out: picking Easy must not read
    // back as "has not chosen" and resurrect the remembered opponent.
    storage.setDailyLevel('master');
    const href = dailyHrefFor(DEFAULT_LEVEL, '');
    expect(resolveDailyLevel(new URL(href, 'https://x').search)).toBe(DEFAULT_LEVEL);
  });

  it('preserves unrelated query parameters', () => {
    expect(dailyHrefFor('expert', '?debug=1')).toBe('/daily?debug=1&ai=expert');
  });
});
