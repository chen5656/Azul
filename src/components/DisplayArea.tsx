import { CENTER, COLOR_NAMES, NUM_COLORS, NUM_DISPLAYS } from '../engine';
import type { Session } from '../game/useGameSession';
import { FirstToken, Tile } from './Tile';

function sourceLabel(source: number): string {
  return source === CENTER ? 'Center' : `Factory ${source + 1}`;
}

/**
 * DisplayArea: The five factory circular displays and the elliptical center pool.
 * Layout matches image_pc.png with circular discs arranged 2x2 + 1 centered,
 * and an elliptical center pool with abundant room for accumulating tiles.
 */
export function DisplayArea({ session }: { session: Session }) {
  const { game, selection, select, canSelect, spotlight } = session;
  const state = game.state;

  const factoryGroup = (source: number, counts: number[]) => {
    const colors = counts.map((n, c) => [c, n] as const).filter(([, n]) => n > 0);
    const lit = spotlight?.kind === 'source' && spotlight.index === source;

    return (
      <div
        key={source}
        className="flex flex-col items-center gap-1"
        aria-label={sourceLabel(source)}
      >
        <span className="text-[11px] font-medium text-neutral-400">
          {sourceLabel(source)}
        </span>
        <div
          className={`azul-factory-disc relative flex aspect-square items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-900/70 p-1.5 sm:p-2 shadow-md backdrop-blur-sm transition-all ${
            lit
              ? 'border-sky-400 ring-2 ring-sky-400/80 shadow-sky-500/20'
              : 'hover:border-neutral-600'
          }`}
        >
          {colors.length === 0 ? (
            <div className="azul-factory-empty grid place-items-center">
              <span className="text-[10px] text-neutral-600">empty</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 p-1">
              {colors.map(([color, n]) => {
                const enabled = canSelect(source, color);
                const active = selection?.source === source && selection.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    disabled={!enabled}
                    onClick={() => select(source, color)}
                    aria-pressed={active}
                    aria-label={`Take ${n} ${COLOR_NAMES[color]} from ${sourceLabel(source)}`}
                    className={`contents ${!enabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    {Array.from({ length: n }, (_, i) => (
                      <Tile key={i} color={color} selected={active} size="sm" />
                    ))}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const centerGroup = () => {
    const counts = state.center;
    const colors = counts.map((n, c) => [c, n] as const).filter(([, n]) => n > 0);
    const lit = spotlight?.kind === 'source' && spotlight.index === CENTER;
    const hasItems = colors.length > 0 || state.center_has_token;
    const totalTiles = colors.reduce((acc, [, n]) => acc + n, 0) + (state.center_has_token ? 1 : 0);

    const sizeClass =
      totalTiles >= 12
        ? 'azul-center-pool-huge'
        : totalTiles >= 6
        ? 'azul-center-pool-large'
        : '';

    return (
      <div
        key={CENTER}
        className="flex flex-col items-center gap-1.5 mt-2 w-full"
        aria-label={sourceLabel(CENTER)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          Center
        </span>
        <div
          className={`azul-center-pool ${sizeClass} relative flex flex-col items-center justify-center border border-neutral-700/80 bg-neutral-900/70 px-4 py-3 shadow-xl backdrop-blur-sm transition-all duration-300 ${
            lit
              ? 'border-sky-400 ring-2 ring-sky-400/80 shadow-sky-500/20'
              : 'hover:border-neutral-600'
          }`}
        >
          <div className="flex h-full w-full max-w-full flex-wrap items-center justify-center content-center gap-1.5 p-1 overflow-visible">
            {state.center_has_token && (
              <div className="shrink-0 -rotate-6 transition-transform hover:scale-110">
                <FirstToken size="sm" />
              </div>
            )}
            {colors.map(([color, n], groupIdx) => {
              const enabled = canSelect(CENTER, color);
              const active = selection?.source === CENTER && selection.color === color;
              const rotation = groupIdx % 2 === 0 ? 'rotate-2' : '-rotate-3';
              return (
                <button
                  key={color}
                  type="button"
                  disabled={!enabled}
                  onClick={() => select(CENTER, color)}
                  aria-pressed={active}
                  aria-label={`Take ${n} ${COLOR_NAMES[color]} from ${sourceLabel(CENTER)}`}
                  className={`flex shrink-0 flex-wrap gap-1 rounded-lg p-1 transition-all ${rotation} ${
                    enabled ? 'hover:bg-neutral-800 hover:scale-105' : 'cursor-not-allowed opacity-40'
                  } ${active ? 'bg-sky-900/70 ring-2 ring-sky-400 scale-105 shadow-md' : ''}`}
                >
                  {Array.from({ length: n }, (_, i) => (
                    <Tile key={i} color={color} selected={active} size="sm" />
                  ))}
                </button>
              );
            })}
            {!hasItems && <span className="text-xs text-neutral-600">empty</span>}
          </div>
        </div>

        {/* Count Pill badge */}
        <div className="rounded-full border border-neutral-700/60 bg-neutral-900/80 px-3 py-0.5 text-[11px] font-medium tabular-nums text-neutral-300 shadow-sm">
          {totalTiles} tiles
        </div>
      </div>
    );
  };

  const displays = state.displays;

  return (
    <div className="azul-display-area flex flex-col items-center gap-2 sm:gap-3 w-full py-0.5 sm:py-1">
      {/* Factories Section */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Factories
        </h2>
        {/* Discs 1 & 2 */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 w-full justify-items-center">
          {factoryGroup(0, displays[0] ?? new Array(NUM_COLORS).fill(0))}
          {factoryGroup(1, displays[1] ?? new Array(NUM_COLORS).fill(0))}
        </div>
        {/* Discs 3 & 4 */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 w-full justify-items-center">
          {factoryGroup(2, displays[2] ?? new Array(NUM_COLORS).fill(0))}
          {factoryGroup(3, displays[3] ?? new Array(NUM_COLORS).fill(0))}
        </div>
        {/* Disc 5 (Centered) */}
        <div className="flex justify-center w-full">
          {NUM_DISPLAYS > 4 && factoryGroup(4, displays[4] ?? new Array(NUM_COLORS).fill(0))}
        </div>
      </div>

      {/* Center Pool Section */}
      {centerGroup()}
    </div>
  );
}
