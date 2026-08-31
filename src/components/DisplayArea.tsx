import { CENTER, COLOR_NAMES, NUM_COLORS, NUM_DISPLAYS } from '../engine';
import type { Session } from '../game/useGameSession';
import { FirstToken, Tile } from './Tile';

function sourceLabel(source: number): string {
  return source === CENTER ? 'Center' : `Factory ${source + 1}`;
}

/**
 * The five factory displays and the center. A color group is clickable only
 * when some legal action starts from it — illegal groups are never enabled
 * (§9.2).
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
        className={`flex flex-col items-center rounded-lg border bg-neutral-800/60 p-2 ${
          lit
            ? 'border-sky-400 ring-2 ring-sky-400/70'
            : 'border-neutral-700'
        }`}
        aria-label={sourceLabel(source)}
      >
        <div className="mb-1.5 self-start text-xs text-neutral-400">{sourceLabel(source)}</div>
        {colors.length === 0 ? (
          <div className="azul-factory-empty grid place-items-center">
            <span className="text-xs text-neutral-600">empty</span>
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
                    <Tile key={i} color={color} selected={active} />
                  ))}
                </button>
              );
            })}
          </div>
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
        className={`rounded-lg border bg-neutral-800/60 p-2.5 ${
          lit
            ? 'border-sky-400 ring-2 ring-sky-400/70'
            : 'border-neutral-700'
        }`}
        aria-label={sourceLabel(CENTER)}
      >
        <div className="mb-1 text-xs text-neutral-400">{sourceLabel(CENTER)}</div>
        <div className="flex min-h-[var(--azul-lg,3.25rem)] flex-wrap items-center gap-2">
          {state.center_has_token && <FirstToken />}
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
                className={`flex max-w-full flex-wrap gap-1 rounded p-1.5 ${
                  enabled ? 'hover:bg-neutral-700' : 'cursor-not-allowed opacity-40'
                } ${active ? 'bg-sky-900/60' : ''}`}
              >
                {Array.from({ length: n }, (_, i) => (
                  <Tile key={i} color={color} selected={active} />
                ))}
              </button>
            );
          })}
          {!hasItems && <span className="text-xs text-neutral-600">empty</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {Array.from({ length: NUM_DISPLAYS }, (_, i) =>
          factoryGroup(i, state.displays[i] ?? new Array(NUM_COLORS).fill(0)),
        )}
      </div>
      {centerGroup()}
    </div>
  );
}
