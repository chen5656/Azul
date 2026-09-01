import type { RefObject } from 'react';
import {
  type Action,
  CENTER,
  COLOR_INITIALS,
  type GameEvent,
  type GameState,
  NUM_COLORS,
  PENALTY_DEST,
  type PenaltyApplied,
  STAGING_CAPACITY,
  type TileScored,
} from '../engine';
import type { GameStyle } from '../context/GameStyleContext';

const FILL_NORMAL = [
  'bg-tile-blue text-white shadow-sm border-blue-400/40',
  'bg-tile-yellow text-neutral-900 shadow-sm border-amber-300/40',
  'bg-tile-red text-white shadow-sm border-rose-400/40',
  'bg-tile-black text-neutral-200 shadow-sm border-neutral-600/40',
  'bg-tile-white text-neutral-900 shadow-sm border-slate-300/40',
];

export interface Animator {
  flyTile: (
    color: number,
    fromId: string,
    toId: string,
    options?: { ms?: number; delay?: number; isToken?: boolean },
  ) => Promise<void>;
  popScore: (text: string, anchorId: string, good: boolean) => void;
  fadeOut: (elementIds: string[], ms?: number) => Promise<void>;
  /** Land a tile: the target snaps in with a bounce so the arrival registers. */
  popIn: (elementIds: string[], delay?: number) => void;
  /**
   * Hold elements invisible for the length of a flight; the returned callback
   * puts them back. Nothing else can express "this tile is in the air" — the
   * engine state around a flight is either not committed yet (the source still
   * shows the tile that is leaving) or already committed (the wall already
   * shows the tile that is arriving).
   */
  conceal: (elementIds: string[]) => () => void;
  clear: () => void;
  isEnabled: () => boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Flight tuning. The hero simulation on the home page reads well because a
 * move is one visible block of tiles leaving a source and landing somewhere —
 * so the game uses the same beats: long enough to follow, staggered enough to
 * count the tiles, and with the source emptying as the block lifts off.
 */
const FLY_MS = 460;
const STAGGER_MS = 60;
/** Upper bound on how long a tile may be held invisible mid-flight. */
const HOLD_MS = 2000;

export function createAnimator(rootRef: RefObject<HTMLElement | null>, style: GameStyle): Animator {
  const inFlight = new Set<HTMLElement>();
  /**
   * Fade-outs run on *real* board nodes with `fill: 'forwards'`. React reuses
   * those nodes for the post-settlement placeholders, so the filled `opacity: 0`
   * would stick around and make empty slots vanish for good. Every fade is
   * tracked here and cancelled once it has played (or when the board resets).
   */
  const fading = new Set<Animation>();

  const isReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isEnabled = () => style !== 'focus' && !isReducedMotion();

  const el = (id: string) => rootRef.current?.querySelector<HTMLElement>(`[data-anim-id="${id}"]`) ?? null;

  const rect = (id: string) => {
    const root = rootRef.current;
    const node = el(id);
    if (!root || !node) return null;
    const a = node.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    if (a.width === 0 && a.height === 0) return null; // In test environments or unrendered state
    return {
      x: a.left - b.left,
      y: a.top - b.top,
      width: a.width,
      height: a.height,
    };
  };

  const flyTile = (
    color: number,
    fromId: string,
    toId: string,
    options: { ms?: number; delay?: number; isToken?: boolean } = {},
  ): Promise<void> =>
    new Promise<void>((resolve) => {
      if (!isEnabled()) return resolve();
      const root = rootRef.current;
      const a = rect(fromId) ?? rect(fromId.replace(/-\d+$/, '')); // fallback to parent if specific slot not found
      const b = rect(toId) ?? rect(toId.replace(/-\d+$/, ''));
      if (!root || !a || !b) return resolve();

      const ms = options.ms ?? FLY_MS;
      const delay = options.delay ?? 0;
      const isToken = options.isToken ?? false;

      const node = document.createElement('div');
      if (isToken) {
        node.className =
          'azul-tile grid place-items-center rounded-full border-2 border-sky-400 bg-sky-950/90 font-bold text-sky-200 shadow-lg shadow-black/50 pointer-events-none absolute z-40';
        node.textContent = '1';
      } else {
        node.className = `azul-tile ${FILL_NORMAL[color] ?? 'bg-neutral-800'} grid place-items-center rounded border font-bold pointer-events-none absolute z-40 shadow-xl shadow-black/60 ring-1 ring-white/20`;
        node.textContent = COLOR_INITIALS[color] ?? '';
      }

      if (a.width > 0) {
        node.style.width = `${a.width}px`;
        node.style.height = `${a.height}px`;
      }
      node.style.left = `${a.x}px`;
      node.style.top = `${a.y}px`;

      root.appendChild(node);
      inFlight.add(node);

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lift = Math.max(28, Math.abs(dx) * 0.22);

      if (typeof node.animate !== 'function') {
        inFlight.delete(node);
        node.remove();
        return resolve();
      }

      const anim = node.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
          {
            transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) rotate(${dx > 0 ? 8 : -8}deg) scale(1.28)`,
            offset: 0.5,
          },
          { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(1)` },
        ],
        { duration: ms, delay, easing: 'cubic-bezier(0.34, 0.8, 0.3, 1)', fill: 'both' },
      );

      const land = () => {
        inFlight.delete(node);
        node.remove();
        resolve();
      };
      anim.onfinish = land;
      setTimeout(land, ms + delay + 300);
    });

  const popScore = (text: string, anchorId: string, good: boolean) => {
    if (!isEnabled()) return;
    const root = rootRef.current;
    const at = rect(anchorId) ?? rect(anchorId.replace(/-\d+$/, ''));
    if (!root || !at) return;

    const node = document.createElement('div');
    node.textContent = text;
    node.className = `pointer-events-none absolute z-50 text-base font-black tabular-nums drop-shadow-md ${
      good ? 'text-sky-300' : 'text-rose-400'
    }`;
    node.style.left = `${at.x + (at.width ? at.width / 4 : 0)}px`;
    node.style.top = `${at.y}px`;

    root.appendChild(node);
    inFlight.add(node);

    if (typeof node.animate !== 'function') {
      inFlight.delete(node);
      node.remove();
      return;
    }

    const anim = node.animate(
      [
        { transform: 'translate(0px, 0px) scale(0.6)', opacity: 0 },
        { transform: 'translate(4px, -12px) scale(1.2)', opacity: 1, offset: 0.3 },
        { transform: 'translate(8px, -30px) scale(1)', opacity: 0 },
      ],
      { duration: 800, easing: 'ease-out', fill: 'forwards' },
    );

    const gone = () => {
      inFlight.delete(node);
      node.remove();
    };
    anim.onfinish = gone;
    setTimeout(gone, 1100);
  };

  const fadeOut = (elementIds: string[], ms = 280): Promise<void> => {
    if (!isEnabled()) return Promise.resolve();
    return Promise.all(
      elementIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            const node = el(id);
            if (!node || typeof node.animate !== 'function') return resolve();
            const anim = node.animate(
              [
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: 'scale(0.6) translateY(6px)' },
              ],
              { duration: ms, easing: 'ease-in', fill: 'forwards' },
            );
            fading.add(anim);
            const done = () => {
              if (!fading.delete(anim)) return;
              anim.cancel(); // drop the forwards fill so the slot renders again
              resolve();
            };
            anim.onfinish = done;
            setTimeout(done, ms + 220);
          }),
      ),
    ).then(() => {});
  };

  /**
   * The landing half of a flight. Tracked in `fading` alongside the fades so a
   * board reset cancels it — and so no `fill` is ever left stuck on a node
   * React will reuse.
   */
  const popIn = (elementIds: string[], delay = 0) => {
    if (!isEnabled()) return;
    for (const id of elementIds) {
      const node = el(id);
      if (!node || typeof node.animate !== 'function') continue;
      const anim = node.animate(
        [
          { transform: 'scale(0.45)', opacity: 0 },
          { transform: 'scale(1.22)', opacity: 1, offset: 0.55 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 340, delay, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)', fill: 'both' },
      );
      fading.add(anim);
      const done = () => {
        if (!fading.delete(anim)) return;
        anim.cancel();
      };
      anim.onfinish = done;
      setTimeout(done, 340 + delay + 220);
    }
  };

  const conceal = (elementIds: string[]): (() => void) => {
    if (!isEnabled()) return () => {};
    const held: Animation[] = [];
    for (const id of elementIds) {
      const node = el(id);
      if (!node || typeof node.animate !== 'function') continue;
      const anim = node.animate([{ opacity: 0 }, { opacity: 0 }], {
        duration: HOLD_MS,
        fill: 'forwards',
      });
      fading.add(anim);
      held.push(anim);
      // A caller that never gets to release — an aborted turn, a thrown error —
      // must not leave the element hidden for good.
      const expire = () => {
        if (fading.delete(anim)) anim.cancel();
      };
      anim.onfinish = expire;
      setTimeout(expire, HOLD_MS + 200);
    }
    return () => {
      for (const anim of held) {
        if (fading.delete(anim)) anim.cancel();
      }
    };
  };

  const clear = () => {
    for (const node of inFlight) {
      node.remove();
    }
    inFlight.clear();
    for (const anim of fading) {
      anim.cancel();
    }
    fading.clear();
  };

  return {
    flyTile,
    popScore,
    fadeOut,
    popIn,
    conceal,
    clear,
    isEnabled,
  };
}

export async function animateDraft(
  animator: Animator,
  beforeState: GameState,
  action: Action,
  player: number,
): Promise<void> {
  if (!animator.isEnabled()) return;
  const { source, color, dest } = action;
  const board = beforeState.players[player];
  const flights: Promise<void>[] = [];
  /**
   * The tiles that are leaving fade out under the fliers, so a move reads as
   * the block actually departing rather than a copy of it drifting past. They
   * fade for exactly the length of the flight: the engine commits the new state
   * the moment the last tile lands, which is what puts them back.
   */
  const departing: string[] = [];
  /** Where the block lands, popped in once the flight is over. */
  const arrivals: string[] = [];

  let count = 0;
  if (source === CENTER) {
    count = beforeState.center[color];
    if (beforeState.center_has_token) {
      const tokenFloorIdx = board.penalty_tiles.length;
      departing.push('center-token');
      arrivals.push(`floor-${player}-${Math.min(tokenFloorIdx, 6)}`);
      flights.push(
        animator.flyTile(-1, 'center-token', `floor-${player}-${Math.min(tokenFloorIdx, 6)}`, {
          isToken: true,
        }),
      );
    }
  } else {
    count = beforeState.displays[source][color];
    // Factory leftovers fly to center pool
    let leftoverIdx = 0;
    for (let c = 0; c < NUM_COLORS; c += 1) {
      if (c !== color && beforeState.displays[source][c] > 0) {
        const leftCount = beforeState.displays[source][c];
        for (let i = 0; i < leftCount; i += 1) {
          const fromId = `fac-${source}-${c}-${i}`;
          departing.push(fromId);
          flights.push(
            animator.flyTile(c, fromId, 'center-pool', {
              delay: (count + leftoverIdx) * STAGGER_MS,
            }),
          );
          leftoverIdx += 1;
        }
      }
    }
  }

  if (count <= 0) {
    if (flights.length) {
      const releaseLeftovers = animator.conceal(departing);
      await Promise.all(flights);
      releaseLeftovers();
    }
    return;
  }

  const capacity = dest === PENALTY_DEST ? 0 : STAGING_CAPACITY[dest];
  const already = dest === PENALTY_DEST ? 0 : board.staging_counts[dest];
  const room = Math.max(0, capacity - already);
  const placed = Math.min(count, room);
  const overflow = count - placed;
  let floorIdx = board.penalty_tiles.length + (source === CENTER && beforeState.center_has_token ? 1 : 0);

  for (let i = 0; i < placed; i += 1) {
    const slot = capacity - already - 1 - i;
    const fromId = source === CENTER ? `center-${color}-${i}` : `fac-${source}-${color}-${i}`;
    const toId = `stage-${player}-${dest}-${slot}`;
    departing.push(fromId);
    arrivals.push(toId);
    flights.push(animator.flyTile(color, fromId, toId, { delay: i * STAGGER_MS }));
  }

  for (let j = 0; j < overflow; j += 1) {
    const fromId = source === CENTER ? `center-${color}-${placed + j}` : `fac-${source}-${color}-${placed + j}`;
    const toId = `floor-${player}-${Math.min(floorIdx, 6)}`;
    floorIdx += 1;
    departing.push(fromId);
    arrivals.push(toId);
    flights.push(animator.flyTile(color, fromId, toId, { delay: (placed + j) * STAGGER_MS }));
  }

  const reveal = animator.conceal(departing);
  try {
    await Promise.all(flights);
  } finally {
    // React commits the new state in the same task, before the browser paints,
    // so releasing here never flashes the tiles that have just left.
    reveal();
  }
  animator.popIn(arrivals);
}

/** Apply one scored tile to the display state, exactly as the engine did. */
function applyScored(view: GameState, event: TileScored): void {
  const board = view.players[event.player];
  board.grid[event.row][event.col] = true;
  board.score += event.points;
  board.staging_colors[event.row] = -1;
  board.staging_counts[event.row] = 0;
}

/** Apply one penalty row to the display state, exactly as the engine did. */
function applyPenalty(view: GameState, event: PenaltyApplied): void {
  const board = view.players[event.player];
  board.score = Math.max(0, board.score + event.points);
  board.penalty_tiles.length = 0;
  board.penalty_overflow = 0;
}

/**
 * Walk the settlement one tile at a time.
 *
 * `view` is the board as it stood *before* the round was settled, and the only
 * thing the player is looking at while this runs: each tile flies from its
 * staging row to the wall, and only then is that single event applied to `view`
 * and committed. Without it the engine's settlement — every row of both boards,
 * every score, the whole next deal — lands in one frame and the flights are
 * just a replay of something that already happened.
 */
export async function animateSettlement(
  animator: Animator,
  events: GameEvent[],
  view: GameState,
  commit: () => void,
): Promise<void> {
  const scoredEvents = events.filter((e): e is TileScored => e.kind === 'tile_scored');
  const penaltyEvents = events.filter((e): e is PenaltyApplied => e.kind === 'penalty');

  if (scoredEvents.length === 0 && penaltyEvents.length === 0) return;

  if (!animator.isEnabled()) {
    for (const event of scoredEvents) applyScored(view, event);
    for (const event of penaltyEvents) applyPenalty(view, event);
    commit();
    return;
  }

  await sleep(220);

  for (const event of scoredEvents) {
    const { player, row, col, color, points } = event;
    const fromId = `stage-${player}-${row}-0`;
    const toId = `wall-${player}-${row}-${col}`;
    const spareIds = Array.from({ length: row }, (_, i) => `stage-${player}-${row}-${i + 1}`);

    await Promise.all([
      animator.flyTile(color, fromId, toId, { ms: FLY_MS }),
      animator.fadeOut(spareIds, 320),
    ]);

    // Committed only now: the tile has landed, so the wall square filling in and
    // the staging row emptying are what the flight just showed happening.
    applyScored(view, event);
    commit();

    animator.popIn([toId]);
    animator.popScore(`+${points}`, toId, true);
    await sleep(340);
  }

  for (const event of penaltyEvents) {
    const { player, points, tiles } = event;
    if (tiles > 0) {
      animator.popScore(`${points}`, `floor-${player}-0`, false);
      const floorIds = Array.from({ length: Math.min(tiles, 7) }, (_, i) => `floor-${player}-${i}`);
      await animator.fadeOut(floorIds, 320);
    }
    applyPenalty(view, event);
    commit();
    if (tiles > 0) await sleep(260);
  }
}
