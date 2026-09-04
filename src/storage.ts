/**
 * localStorage conveniences only (§12.3).
 *
 * No game state and no unsent scores are ever persisted (D-020, FR-032). Every
 * access is wrapped, because private windows and blocked site data throw on the
 * accessor itself — the app must render correctly with none of this present.
 */

const PREFIX = 'quadro.v1.';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // A full or unavailable store costs the player a remembered preference and
    // nothing else.
  }
}

export const storage = {
  practiceLevel: () => read('practiceLevel'),
  setPracticeLevel: (level: string) => write('practiceLevel', level),

  /** The opponent the player last chose on the Daily, for their next visit. */
  dailyLevel: () => read('dailyLevel'),
  setDailyLevel: (level: string) => write('dailyLevel', level),

  practiceSeed: () => read('practiceSeed'),
  setPracticeSeed: (seed: string) => write('practiceSeed', seed),

  /** The last Daily the player finished, for the home screen's marker. */
  lastDailyPlayed: () => read('lastDailyPlayed'),
  setLastDailyPlayed: (puzzleId: string) => write('lastDailyPlayed', puzzleId),

  /** UI display scale / zoom percentage (e.g. 100, 90, 80, 110, 120). */
  displayScale: () => read('displayScale'),
  setDisplayScale: (scale: string) => write('displayScale', scale),

  /** Visual style theme: 'focus' | 'normal' | 'classic' */
  gameStyle: () => read('gameStyle'),
  setGameStyle: (style: string) => write('gameStyle', style),

  /** Daily attempts count per puzzle_id and ai_level */
  dailyAttempts: (puzzleId: string, aiLevel: string): number => {
    const val = read(`dailyAttempts.${puzzleId}.${aiLevel}`);
    const num = val ? parseInt(val, 10) : 0;
    return Number.isFinite(num) && num > 0 ? num : 0;
  },
  incrementDailyAttempts: (puzzleId: string, aiLevel: string): number => {
    const current = storage.dailyAttempts(puzzleId, aiLevel);
    const next = current + 1;
    write(`dailyAttempts.${puzzleId}.${aiLevel}`, String(next));
    return next;
  },
};
