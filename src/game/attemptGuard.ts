/**
 * "Is a Daily attempt running right now?"
 *
 * A one-value store rather than context, because the only consumer is the
 * update banner at the top of the shell and the only producer is the Daily
 * screen deep inside it (AC-038).
 */

import { useSyncExternalStore } from 'react';

let running = false;
const listeners = new Set<() => void>();

export function setAttemptRunning(value: boolean): void {
  if (running === value) return;
  running = value;
  for (const listener of listeners) listener();
}

export function useAttemptRunning(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => running,
    () => false,
  );
}
