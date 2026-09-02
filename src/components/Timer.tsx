import { useEffect, useState } from 'react';

/**
 * The Daily clock. Total wall time including the opponent's thinking (D-012).
 *
 * The live region is `off` and only announces at the end of the game, so a
 * screen reader is not read a new time every frame (NFR-006).
 */

export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Whole seconds, for the boards — alias of formatElapsed. */
export const formatElapsedSeconds = formatElapsed;

export function Timer({
  ms,
  running,
  done,
  startedAt = null,
}: {
  ms: number;
  running: boolean;
  done: boolean;
  /**
   * `performance.now()` at the start of the game. Given one, the clock ticks
   * itself once a second — the readout is whole seconds, so anything faster is
   * work nobody can see, and keeping it here stops the tick from re-rendering
   * the board behind it.
   */
  startedAt?: number | null;
}) {
  const live = running && startedAt !== null;
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!live) return;
    setNow(performance.now());
    // An interval rather than requestAnimationFrame: rAF stops in a background
    // tab, and the displayed time would sit still while the clock that actually
    // gets submitted keeps running.
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live, startedAt]);

  const shown = live ? now - (startedAt as number) : ms;

  return (
    <div
      className="flex items-baseline gap-2"
      aria-live="off"
      aria-label={done ? `Final time ${formatElapsed(shown)}` : undefined}
    >
      <span
        className={`font-mono text-sm sm:text-base font-medium tabular-nums ${
          done ? 'text-sky-300' : running ? 'text-neutral-100' : 'text-neutral-500'
        }`}
      >
        {formatElapsed(shown)}
      </span>
      {!running && !done && <span className="text-xs text-neutral-500">starts on your first move</span>}
    </div>
  );
}
