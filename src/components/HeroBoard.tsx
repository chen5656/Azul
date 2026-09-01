/**
 * A decorative, static snapshot of a Quadro board for the home page hero.
 *
 * Deliberately not the real `PlayerBoard`: that one needs a live `Session`, and
 * the hero must render before any game code loads. The wall pattern is the real
 * `GRID_COLOR` table, so what a first-time visitor sees is the actual layout of
 * the game rather than an illustrator's idea of it.
 *
 * Cells are a fixed square (`--hero-cell`) rather than fractions, so a
 * one-tile staging row and a five-tile one draw the same size tile.
 */

import { COLOR_INITIALS, GRID_COLOR, NUM_ROWS } from '../engine';

const FILL = [
  'bg-tile-blue text-white border-blue-400/40',
  'bg-tile-yellow text-neutral-900 border-amber-300/40',
  'bg-tile-red text-white border-rose-400/40',
  'bg-tile-black text-neutral-200 border-neutral-600/40',
  'bg-tile-white text-neutral-900 border-slate-300/40',
];

/**
 * A plausible mid-game position, hand-picked so the wall reads as one cluster
 * growing outward — the thing the "Build" pitch below the hero describes.
 */
const SETTLED: readonly (readonly number[])[] = [
  [0, 1],
  [1, 2],
  [1, 2, 3],
  [2, 3],
  [3],
];
/** Per staging row: how many tiles are on it, and of which color. */
const STAGED: readonly (readonly [filled: number, color: number])[] = [
  [1, 3],
  [0, 0],
  [2, 4],
  [1, 0],
  [4, 1],
];
const CELL = 'h-[var(--hero-cell)] w-[var(--hero-cell)] rounded-[3px] border';

/**
 * The color initial is drawn as pseudo-element content rather than a text node:
 * the board is decorative, and as real text these 19 letters would land in the
 * page's extracted text where a crawler reads them as body copy.
 */
function Tile({ color }: { color: number }) {
  return (
    <div
      data-initial={COLOR_INITIALS[color]}
      className={`${CELL} grid place-items-center text-[9px] font-bold before:content-[attr(data-initial)] sm:text-[11px] ${FILL[color]}`}
    />
  );
}

function Empty({ faint = false }: { faint?: boolean }) {
  return (
    <div
      className={`${CELL} ${faint ? 'border-neutral-800/60 bg-neutral-900/20' : 'border-neutral-700/40 bg-neutral-900/40'}`}
    />
  );
}

export function HeroBoard() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mx-auto w-fit select-none rounded-2xl border border-neutral-700/60 bg-neutral-900/60 p-4 shadow-lg shadow-black/40 backdrop-blur-sm [--hero-cell:1.5rem] sm:p-5 sm:[--hero-cell:1.9rem]"
    >
      <div className="flex items-start gap-4 sm:gap-6">
        {/* Staging rows, right-aligned so they fill toward the wall. */}
        <div className="flex flex-col gap-1">
          {Array.from({ length: NUM_ROWS }, (_, row) => {
            const capacity = row + 1;
            const [filled, color] = STAGED[row];
            return (
              <div key={row} className="flex justify-end gap-1">
                {Array.from({ length: capacity }, (_, i) =>
                  i >= capacity - filled ? (
                    <Tile key={i} color={color} />
                  ) : (
                    <Empty key={i} />
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
                SETTLED[row].includes(col) ? (
                  <Tile key={col} color={color} />
                ) : (
                  <Empty key={col} faint />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Floor line. */}
      <div className="mt-4 flex gap-1 border-t border-neutral-800 pt-4">
        {Array.from({ length: 7 }, (_, i) => (i === 0 ? <Tile key={i} color={2} /> : <Empty key={i} />))}
      </div>
    </div>
  );
}
