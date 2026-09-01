import type { ReactNode } from 'react';
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
export function DisplayArea({
  session,
}: {
  session: Session;
  title?: ReactNode;
}) {
  const { displayState, selection, select, canSelect, spotlight } = session;
  const state = displayState;

  const factoryGroup = (source: number, counts: number[]) => {
    const colors = counts.map((n, c) => [c, n] as const).filter(([, n]) => n > 0);
    const lit = spotlight?.kind === 'source' && spotlight.index === source;

    return (
      <div
        key={source}
        data-anim-id={`fac-${source}`}
        data-tutorial-target={`source-${source}`}
        className={`grid grid-cols-2 gap-1 rounded-full border bg-neutral-950/40 p-1.5 transition-all ${
          lit
            ? 'border-sky-400 ring-2 ring-sky-400/80 shadow-md shadow-sky-500/20'
            : 'border-neutral-700/50 hover:border-neutral-600'
        }`}
        aria-label={sourceLabel(source)}
      >
        {colors.length === 0 ? (
          Array.from({ length: 4 }, (_, i) => (
            <Tile key={i} empty size="sm" />
          ))
        ) : (
          colors.map(([color, n]) => {
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
                  <Tile
                    key={i}
                    animId={`fac-${source}-${color}-${i}`}
                    color={color}
                    selected={active}
                    size="sm"
                  />
                ))}
              </button>
            );
          })
        )}
      </div>
    );
  };

  const centerGroup = () => {
    const counts = state.center;
    const colors = counts.map((n, c) => [c, n] as const).filter(([, n]) => n > 0);
    const lit = spotlight?.kind === 'source' && spotlight.index === CENTER;
    const hasItems = colors.length > 0 || state.center_has_token;

    return (
      <div
        key={CENTER}
        data-anim-id="center-pool"
        data-tutorial-target={`source-${CENTER}`}
        className={`flex flex-wrap items-center justify-center gap-1 min-h-[2.5rem] py-1 transition-all rounded-lg ${
          lit ? 'ring-2 ring-sky-400/80 bg-sky-950/20 px-2' : ''
        }`}
        aria-label={sourceLabel(CENTER)}
      >
        {state.center_has_token && (
          <div className="shrink-0 -rotate-6 transition-transform hover:scale-110">
            <FirstToken animId="center-token" size="sm" />
          </div>
        )}
        {colors.map(([color, n]) => {
          const enabled = canSelect(CENTER, color);
          const active = selection?.source === CENTER && selection.color === color;
          return (
            <button
              key={color}
              type="button"
              disabled={!enabled}
              onClick={() => select(CENTER, color)}
              aria-pressed={active}
              aria-label={`Take ${n} ${COLOR_NAMES[color]} from ${sourceLabel(CENTER)}`}
              className={`flex shrink-0 gap-1 rounded p-0.5 transition-all ${
                enabled ? 'hover:bg-neutral-800 hover:scale-105' : 'cursor-not-allowed opacity-40'
              } ${active ? 'bg-sky-900/70 ring-2 ring-sky-400 scale-105 shadow-md' : ''}`}
            >
              {Array.from({ length: n }, (_, i) => (
                <Tile
                  key={i}
                  animId={`center-${color}-${i}`}
                  color={color}
                  selected={active}
                  size="sm"
                />
              ))}
            </button>
          );
        })}
        {!hasItems && (
          <div className="flex gap-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Tile key={i} empty size="sm" />
            ))}
          </div>
        )}
      </div>
    );
  };

  const displays = state.displays;

  return (
    <div className="azul-display-area flex flex-col items-center gap-2 w-full py-0.5">
      {/* Factories row: wrapped flex container matching Home hero */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {Array.from({ length: NUM_DISPLAYS }, (_, source) =>
          factoryGroup(source, displays[source] ?? new Array(NUM_COLORS).fill(0)),
        )}
      </div>

      {/* Center pool row: compact row with bottom border matching Home hero */}
      <div className="mt-1 flex w-full justify-center border-b border-neutral-800/80 pb-2">
        {centerGroup()}
      </div>
    </div>
  );
}
