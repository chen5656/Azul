import { useSyncExternalStore } from 'react';

/**
 * Two layout shells, not three.
 *
 * Phones and tablets want the same thing — one vertical column: factories on
 * top, then each player's board — the tablet is simply a scaled-up phone. Only
 * a genuinely wide *and* tall viewport earns the three-column desktop shell, so
 * a phone or tablet held in landscape stays stacked instead of being squeezed
 * into columns that have no vertical room.
 */
export type LayoutMode = 'stacked' | 'wide';

/** Above an iPad's 820px portrait width, so tablets stay stacked. */
const WIDE_MIN_WIDTH = 900;
/** Three columns of board need real height; below this the stack reads better. */
const WIDE_MIN_HEIGHT = 620;

const QUERY = `(min-width: ${WIDE_MIN_WIDTH}px) and (min-height: ${WIDE_MIN_HEIGHT}px)`;

const supported = () => typeof matchMedia === 'function';

function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => {};
  const mql = matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Without `matchMedia` (SSR, jsdom) assume the desktop shell. */
function getSnapshot(): LayoutMode {
  if (!supported()) return 'wide';
  return matchMedia(QUERY).matches ? 'wide' : 'stacked';
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'wide');
}
