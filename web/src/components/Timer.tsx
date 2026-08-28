/**
 * The Daily clock. Total wall time including the opponent's thinking (D-012).
 *
 * The live region is `off` and only announces at the end of the game, so a
 * screen reader is not read a new time every frame (NFR-006).
 */

export function formatElapsed(ms: number): string {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = Math.floor(clamped % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    millis,
  ).padStart(3, '0')}`;
}

export function Timer({ ms, running, done }: { ms: number; running: boolean; done: boolean }) {
  return (
    <div
      className="flex items-baseline gap-2"
      aria-live="off"
      aria-label={done ? `Final time ${formatElapsed(ms)}` : undefined}
    >
      <span
        className={`font-mono text-2xl tabular-nums ${
          done ? 'text-sky-300' : running ? 'text-neutral-100' : 'text-neutral-500'
        }`}
      >
        {formatElapsed(ms)}
      </span>
      {!running && !done && <span className="text-xs text-neutral-500">starts on your first move</span>}
    </div>
  );
}
