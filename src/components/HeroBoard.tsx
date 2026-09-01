/**
 * A small, self-playing Quadro board for the home page hero.
 *
 * Deliberately not the real `PlayerBoard`: that one needs a live `Session`, and
 * the hero must render before any game code loads. The wall pattern and the
 * scoring are the real `GRID_COLOR` / `scorePlacement` from the engine, so what
 * a visitor watches is the actual game rather than an illustrator's idea of it.
 *
 * The loop replays one hand-written round: each turn lifts *every* tile of one
 * color out of a factory at once — that is the move the rules describe, so the
 * tiles travel as a block — the leftovers fall to the center, and only when the
 * round runs dry do full rows settle onto the wall and score. Nothing appears
 * by simply switching on: a tile that pops into place reads as a rendering
 * glitch, whereas the flight is what explains the rules to a first-time viewer.
 *
 * Cells are a fixed square (`--hero-cell`) rather than fractions, so a
 * one-tile staging row and a five-tile one draw the same size tile.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLOR_INITIALS, GRID_COLOR, NUM_ROWS, PENALTIES, gridCol, scorePlacement } from '../engine';

const FILL = [
  'bg-tile-blue text-white border-blue-400/40',
  'bg-tile-yellow text-neutral-900 border-amber-300/40',
  'bg-tile-red text-white border-rose-400/40',
  'bg-tile-black text-neutral-200 border-neutral-600/40',
  'bg-tile-white text-neutral-900 border-slate-300/40',
];

const CELL = 'h-[var(--hero-cell)] w-[var(--hero-cell)] rounded-[3px] border';
const B = 0, Y = 1, R = 2, K = 3, W = 4;

const FACTORIES: readonly (readonly number[])[] = [
  [B, B, Y, R],
  [W, W, K, Y],
  [R, R, R, B],
  [K, K, W, W],
];

/** Tiles already on the wall when the round starts, as [row, col]. */
const SEED: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 2],
  [1, 0],
  [2, 3],
];

const CENTER_SLOTS = 8;
const FLOOR_SLOTS = 7;

/**
 * The scripted round. Each turn takes every tile of one color from one factory
 * (or from the center, `factory: -1`) onto one staging row — the actual legal
 * move, so the sequence is a round a visitor could have played themselves.
 * Tiles past the end of the row spill onto the floor, penalties and all.
 */
type Turn = { factory: number; color: number; row: number };
const SCRIPT: readonly Turn[] = [
  { factory: 0, color: B, row: 1 },
  { factory: 1, color: W, row: 4 },
  { factory: 2, color: R, row: 2 },
  { factory: 3, color: W, row: 4 },
  { factory: -1, color: K, row: 3 },
  { factory: -1, color: Y, row: 0 },
  { factory: -1, color: B, row: -1 },
  { factory: -1, color: R, row: -1 },
];

const FLY_MS = 520;
const SETTLE_MS = 560;
const TURN_PAUSE_MS = 620;
const SCORE_PAUSE_MS = 620;
const LOOP_PAUSE_MS = 2200;

/**
 * Where every center tile stands after a turn: `moves` are tiles already there
 * that shift along, `arrivals` are leftovers coming in from the source, and
 * `next` is the resulting center. Sorting by color is what keeps a color in one
 * block instead of scattered across the pile.
 */
type CenterPlan = {
  moves: { from: number; to: number; color: number }[];
  arrivals: { slot: number; to: number; color: number }[];
  next: number[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Staged = { color: number; filled: number };
const emptyStaging = (): Staged[] => Array.from({ length: NUM_ROWS }, () => ({ color: -1, filled: 0 }));
const emptyCenter = () => Array<number>(CENTER_SLOTS).fill(-1);
const emptyFloor = () => Array<number>(FLOOR_SLOTS).fill(-1);
const seededWall = (): boolean[][] => {
  const w = Array.from({ length: NUM_ROWS }, () => Array<boolean>(NUM_ROWS).fill(false));
  for (const [r, c] of SEED) w[r][c] = true;
  return w;
};

/**
 * The color initial is drawn as pseudo-element content rather than a text node:
 * the board is decorative, and as real text these letters would land in the
 * page's extracted text where a crawler reads them as body copy.
 */
function tileClass(color: number, extra = '') {
  return `${CELL} grid place-items-center text-[9px] font-bold before:content-[attr(data-initial)] sm:text-[11px] ${FILL[color]} ${extra}`;
}

function Tile({ color, id }: { color: number; id?: string }) {
  return <div data-hero-id={id} data-initial={COLOR_INITIALS[color]} className={tileClass(color)} />;
}

/**
 * An empty slot. `faint` is the wall's unfilled cell, `ghost` is the center —
 * which draws no cell at all, because before a tile lands there is nothing
 * there to look at; the slot still holds its space so flights have a target.
 * `label` is the floor's penalty, drawn (like a tile's initial) as
 * pseudo-element content so it stays out of the page's extracted text.
 */
function Empty({
  faint = false,
  ghost = false,
  label,
  id,
}: {
  faint?: boolean;
  ghost?: boolean;
  label?: string;
  id?: string;
}) {
  const skin = ghost
    ? 'border-transparent'
    : faint
      ? 'border-neutral-800/60 bg-neutral-900/20'
      : 'border-neutral-700/40 bg-neutral-900/40';
  return (
    <div
      data-hero-id={id}
      data-label={label}
      className={`${CELL} ${skin} grid place-items-center text-[9px] font-medium tabular-nums text-neutral-500 before:content-[attr(data-label)] sm:text-[10px]`}
    />
  );
}

/**
 * What the seeded wall was worth when it was built. The round opens with tiles
 * already on the wall, so it cannot honestly open at zero.
 */
function seedScore() {
  const grid = Array.from({ length: NUM_ROWS }, () => Array<boolean>(NUM_ROWS).fill(false));
  let total = 0;
  for (const [r, c] of SEED) {
    grid[r][c] = true;
    total += scorePlacement(grid, r, c)[0];
  }
  return total;
}
const OPENING_SCORE = seedScore();

/** The end state of the script, for anyone who asked the OS for less motion. */
function finalState() {
  const wall = seededWall();
  const staging = emptyStaging();
  const floor: number[] = [];
  let score = OPENING_SCORE;
  const pool = FACTORIES.map((f) => [...f]);
  const center: number[] = [];
  for (const turn of SCRIPT) {
    const src = turn.factory < 0 ? center : pool[turn.factory];
    const taken = src.filter((c) => c === turn.color).length;
    const rest = src.filter((c) => c !== turn.color);
    if (turn.factory < 0) center.length = 0;
    else pool[turn.factory] = [];
    if (turn.factory >= 0) center.push(...rest);
    const room = turn.row < 0 ? 0 : turn.row + 1 - staging[turn.row].filled;
    const kept = Math.min(taken, room);
    if (kept > 0) staging[turn.row] = { color: turn.color, filled: staging[turn.row].filled + kept };
    for (let i = 0; i < taken - kept; i += 1) floor.push(turn.color);
  }
  for (let row = 0; row < NUM_ROWS; row += 1) {
    if (staging[row].filled !== row + 1) continue;
    const col = gridCol(row, staging[row].color);
    wall[row][col] = true;
    score += scorePlacement(wall, row, col)[0];
    staging[row] = { color: -1, filled: 0 };
  }
  for (let i = 0; i < floor.length; i += 1) score += PENALTIES[i];
  return { wall, staging, score: Math.max(0, score) };
}

function planCenter(center: readonly number[], src: readonly number[], turn: Turn): CenterPlan {
  const stay: { slot: number; color: number }[] = [];
  center.forEach((color, slot) => {
    if (color >= 0 && !(turn.factory < 0 && color === turn.color)) stay.push({ slot, color });
  });
  const incoming: { slot: number; color: number }[] = [];
  if (turn.factory >= 0) {
    src.forEach((color, slot) => {
      if (color >= 0 && color !== turn.color) incoming.push({ slot, color });
    });
  }

  const colors = [...stay, ...incoming]
    .map((t) => t.color)
    .sort((a, b) => a - b)
    .slice(0, CENTER_SLOTS);

  const plan: CenterPlan = { moves: [], arrivals: [], next: emptyCenter() };
  const stayLeft = [...stay];
  const inLeft = [...incoming];
  colors.forEach((color, to) => {
    plan.next[to] = color;
    const s = stayLeft.findIndex((t) => t.color === color);
    if (s >= 0) {
      const tile = stayLeft.splice(s, 1)[0];
      if (tile.slot !== to) plan.moves.push({ from: tile.slot, to, color });
      return;
    }
    const i = inLeft.findIndex((t) => t.color === color);
    if (i >= 0) plan.arrivals.push({ slot: inLeft.splice(i, 1)[0].slot, to, color });
  });
  return plan;
}

export function HeroBoard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [factories, setFactories] = useState<number[][]>(() => FACTORIES.map((f) => [...f]));
  const [center, setCenter] = useState<number[]>(emptyCenter);
  const [staging, setStaging] = useState<Staged[]>(emptyStaging);
  const [floor, setFloor] = useState<number[]>(emptyFloor);
  const [wall, setWall] = useState<boolean[][]>(seededWall);
  const [score, setScore] = useState(OPENING_SCORE);

  /**
   * Someone who asked for reduced motion gets the finished round instead of the
   * flights — the point of the hero is the layout, and that survives without
   * any movement at all.
   */
  const [still] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useLayoutEffect(() => {
    if (!still) return;
    const end = finalState();
    setFactories(FACTORIES.map(() => [-1, -1, -1, -1]));
    setWall(end.wall);
    setStaging(end.staging);
    setScore(end.score);
  }, [still]);

  useEffect(() => {
    if (still) return;
    let cancelled = false;
    const inFlight = new Set<HTMLElement>();

    const el = (id: string) => rootRef.current?.querySelector<HTMLElement>(`[data-hero-id="${id}"]`) ?? null;

    const rect = (id: string) => {
      const root = rootRef.current;
      const node = el(id);
      if (!root || !node) return null;
      const a = node.getBoundingClientRect();
      const b = root.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top };
    };

    /**
     * Launch one tile from `from` to `to` and resolve once it lands. The flier
     * is a plain DOM node rather than React state on purpose: it lives for one
     * flight, and a render would race the frame the animation starts on. The
     * arc is a mid-flight lift plus a spin, which keeps a block of tiles headed
     * for neighbouring cells from reading as one tile teleporting twice.
     */
    const flyTo = (color: number, from: string, to: string, ms: number, delay = 0) =>
      new Promise<void>((resolve) => {
        const root = rootRef.current;
        const a = rect(from);
        const b = rect(to);
        if (!root || !a || !b) return resolve();
        const node = document.createElement('div');
        node.dataset.initial = COLOR_INITIALS[color];
        node.className = tileClass(color, 'absolute z-10 shadow-lg shadow-black/50');
        node.style.left = `${a.x}px`;
        node.style.top = `${a.y}px`;
        root.appendChild(node);
        inFlight.add(node);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lift = Math.max(16, Math.abs(dx) * 0.16);
        const anim = node.animate(
          [
            { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
            {
              transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) rotate(${dx > 0 ? 7 : -7}deg) scale(1.1)`,
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
        // A backgrounded tab never fires `onfinish`; without this the whole
        // loop would hang on one unresolved promise.
        setTimeout(land, ms + delay + 400);
      });

    /** A "+5" / "-2" that floats up off the tile that earned it. */
    const popScore = (text: string, anchor: string, good: boolean) => {
      const root = rootRef.current;
      const at = rect(anchor);
      if (!root || !at) return;
      const node = document.createElement('div');
      node.textContent = text;
      node.className = `pointer-events-none absolute z-20 text-sm font-bold tabular-nums drop-shadow ${
        good ? 'text-sky-300' : 'text-rose-400'
      }`;
      node.style.left = `${at.x}px`;
      node.style.top = `${at.y}px`;
      root.appendChild(node);
      inFlight.add(node);
      const anim = node.animate(
        [
          { transform: 'translate(0px, 0px) scale(0.7)', opacity: 0 },
          { transform: 'translate(6px, -14px) scale(1.1)', opacity: 1, offset: 0.3 },
          { transform: 'translate(10px, -34px) scale(1)', opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out', fill: 'forwards' },
      );
      const gone = () => {
        inFlight.delete(node);
        node.remove();
      };
      anim.onfinish = gone;
      setTimeout(gone, 1300);
    };

    /** Tiles that are discarded rather than moved still leave visibly. */
    const fadeOut = (ids: string[]) =>
      Promise.all(
        ids.map(
          (id) =>
            new Promise<void>((resolve) => {
              const node = el(id);
              if (!node) return resolve();
              const anim = node.animate(
                [
                  { opacity: 1, transform: 'scale(1)' },
                  { opacity: 0, transform: 'scale(0.6) translateY(8px)' },
                ],
                { duration: 320, easing: 'ease-in', fill: 'forwards' },
              );
              anim.onfinish = () => resolve();
              setTimeout(resolve, 600);
            }),
        ),
      );

    /**
     * One turn: every tile of `turn.color` leaves the source together, the
     * leftovers fall into the center in the arrangement `plan` worked out, and
     * the board state only changes once the whole block has landed.
     */
    async function draft(
      turn: Turn,
      src: readonly number[],
      stage: Staged[],
      hold: number[],
      plan: CenterPlan,
    ) {
      const taken: number[] = [];
      src.forEach((c, i) => {
        if (c === turn.color) taken.push(i);
      });
      if (taken.length === 0) return;

      const from = (i: number) => (turn.factory < 0 ? `center-${i}` : `fac-${turn.factory}-${i}`);
      const capacity = turn.row < 0 ? 0 : turn.row + 1;
      const already = turn.row < 0 ? 0 : stage[turn.row].filled;
      const room = Math.max(0, capacity - already);
      let floorAt = hold.indexOf(-1);

      // Every tile of the color leaves at once: the move is one block, not a
      // trickle. The stagger is only enough to tell the tiles apart in flight.
      const flights: Promise<void>[] = [];
      const landings: { kind: 'stage' | 'floor'; index: number; color: number }[] = [];
      taken.forEach((slot, n) => {
        if (n < room) {
          const at = capacity - already - 1 - n;
          landings.push({ kind: 'stage', index: at, color: turn.color });
          flights.push(flyTo(turn.color, from(slot), `stage-${turn.row}-${at}`, FLY_MS, n * 45));
        } else if (floorAt >= 0 && floorAt < FLOOR_SLOTS) {
          const at = floorAt;
          floorAt += 1;
          landings.push({ kind: 'floor', index: at, color: turn.color });
          flights.push(flyTo(turn.color, from(slot), `floor-${at}`, FLY_MS, n * 45));
        }
      });

      // What the drafter leaves behind falls into the center, and the tiles
      // already there shuffle along, so the center always reads as one block
      // per color rather than the order the leftovers happened to arrive in.
      plan.arrivals.forEach((a, n) => {
        flights.push(flyTo(a.color, from(a.slot), `center-${a.to}`, FLY_MS, (taken.length + n) * 45));
      });
      plan.moves.forEach((m) => {
        flights.push(flyTo(m.color, `center-${m.from}`, `center-${m.to}`, FLY_MS));
      });

      // The source empties as the block lifts off, as do the center slots whose
      // tile is on its way somewhere else.
      const vacated = new Set(plan.moves.map((m) => m.from));
      if (turn.factory < 0) for (const i of taken) vacated.add(i);
      if (vacated.size) setCenter((c) => c.map((v, i) => (vacated.has(i) ? -1 : v)));
      if (turn.factory >= 0) {
        setFactories((f) => f.map((row, i) => (i === turn.factory ? row.map(() => -1) : row)));
      }

      await Promise.all(flights);
      if (cancelled) return;

      for (const l of landings) {
        if (l.kind === 'stage') stage[turn.row] = { color: l.color, filled: stage[turn.row].filled + 1 };
        else if (l.kind === 'floor') hold[l.index] = l.color;
      }
      setStaging([...stage]);
      setFloor([...hold]);
      setCenter([...plan.next]);
    }

    async function run() {
      for (;;) {
        const pool = FACTORIES.map((f) => [...f]);
        const centerPool = emptyCenter();
        const stage = emptyStaging();
        const hold = emptyFloor();
        const grid = seededWall();
        setFactories(pool.map((f) => [...f]));
        setCenter(emptyCenter());
        setStaging(emptyStaging());
        setFloor(emptyFloor());
        setWall(seededWall());
        setScore(OPENING_SCORE);
        await sleep(TURN_PAUSE_MS);
        if (cancelled) return;

        // ---- Draft ------------------------------------------------------
        for (const turn of SCRIPT) {
          if (cancelled) return;
          const before = turn.factory < 0 ? [...centerPool] : [...pool[turn.factory]];
          const plan = planCenter(centerPool, before, turn);
          if (turn.factory >= 0) pool[turn.factory] = before.map(() => -1);

          await draft(turn, before, stage, hold, plan);
          if (cancelled) return;
          for (let i = 0; i < CENTER_SLOTS; i += 1) centerPool[i] = plan.next[i];
          await sleep(TURN_PAUSE_MS);
        }

        // ---- Score: only now that the round has run dry -------------------
        await sleep(SCORE_PAUSE_MS);
        let total = OPENING_SCORE;
        for (let row = 0; row < NUM_ROWS; row += 1) {
          if (cancelled) return;
          if (stage[row].filled !== row + 1) continue;
          const color = stage[row].color;
          const col = gridCol(row, color);
          const spare = Array.from({ length: row }, (_, i) => `stage-${row}-${i + 1}`);
          const flight = flyTo(color, `stage-${row}-0`, `wall-${row}-${col}`, SETTLE_MS);
          await Promise.all([flight, fadeOut(spare)]);
          if (cancelled) return;
          stage[row] = { color: -1, filled: 0 };
          grid[row][col] = true;
          setStaging([...stage]);
          setWall(grid.map((r) => [...r]));
          const points = scorePlacement(grid, row, col)[0];
          total += points;
          setScore(total);
          popScore(`+${points}`, `wall-${row}-${col}`, true);
          await sleep(SCORE_PAUSE_MS);
        }

        // ---- Floor penalty ------------------------------------------------
        const dropped = hold.filter((c) => c >= 0).length;
        if (dropped > 0) {
          const penalty = PENALTIES.slice(0, dropped).reduce((a, b) => a + b, 0);
          popScore(`${penalty}`, 'floor-0', false);
          total = Math.max(0, total + penalty);
          setScore(total);
          await fadeOut(Array.from({ length: dropped }, (_, i) => `floor-${i}`));
          if (cancelled) return;
          hold.fill(-1);
          setFloor([...hold]);
        }

        await sleep(LOOP_PAUSE_MS);
        if (cancelled) return;
      }
    }
    run();
    return () => {
      cancelled = true;
      for (const node of inFlight) node.remove();
    };
  }, [still]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none relative mx-auto w-fit select-none rounded-2xl border border-neutral-700/60 bg-neutral-900/60 p-4 shadow-lg shadow-black/40 backdrop-blur-sm [--hero-cell:1.5rem] sm:p-5 sm:[--hero-cell:1.9rem]"
    >
      {/* Factories, and the center pile the leftovers fall into. */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {factories.map((slots, f) => (
          <div
            key={f}
            className="grid grid-cols-2 gap-1 rounded-full border border-neutral-700/50 bg-neutral-950/40 p-1.5"
          >
            {slots.map((color, i) =>
              color >= 0 ? (
                <Tile key={i} color={color} id={`fac-${f}-${i}`} />
              ) : (
                <Empty key={i} id={`fac-${f}-${i}`} />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1 border-b border-neutral-800 pb-4">
        {center.map((color, i) =>
          color >= 0 ? (
            <Tile key={i} color={color} id={`center-${i}`} />
          ) : (
            <Empty key={i} ghost id={`center-${i}`} />
          ),
        )}
      </div>

      <div className="mt-4 flex items-start gap-4 sm:gap-6">
        {/* Staging rows, right-aligned so they fill toward the wall. */}
        <div className="flex flex-col gap-1">
          {staging.map(({ color, filled }, row) => {
            const capacity = row + 1;
            return (
              <div key={row} className="flex justify-end gap-1">
                {Array.from({ length: capacity }, (_, i) =>
                  i >= capacity - filled ? (
                    <Tile key={i} color={color} id={`stage-${row}-${i}`} />
                  ) : (
                    <Empty key={i} id={`stage-${row}-${i}`} />
                  ),
                )}
              </div>
            );
          })}
        </div>

        {/* The wall. */}
        <div className="flex flex-col gap-1">
          {GRID_COLOR.map((rowColors, row) => (
            <div key={row} className="flex gap-1">
              {rowColors.map((color, col) =>
                wall[row][col] ? (
                  <Tile key={col} color={color} id={`wall-${row}-${col}`} />
                ) : (
                  <Empty key={col} faint id={`wall-${row}-${col}`} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Floor line, and the running score the round is played for. */}
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-neutral-800 pt-4">
        <div className="flex gap-1">
          {floor.map((color, i) =>
            color >= 0 ? (
              <Tile key={i} color={color} id={`floor-${i}`} />
            ) : (
              <Empty key={i} label={`${PENALTIES[i]}`} id={`floor-${i}`} />
            ),
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Score</div>
          <div className="text-lg font-semibold tabular-nums text-sky-300">{score}</div>
        </div>
      </div>
    </div>
  );
}
