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
  const { game, selection, select, canSelect } = session;
  const state = game.state;

  const group = (source: number, counts: number[]) => {
    const colors = counts.map((n, c) => [c, n] as const).filter(([, n]) => n > 0);
    const isCenter = source === CENTER;

    return (
      <div
        key={source}
        className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-2"
        aria-label={sourceLabel(source)}
      >
        <div className="mb-1 text-xs text-neutral-400">{sourceLabel(source)}</div>
        <div className="flex flex-wrap items-center gap-1">
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
                className={`flex gap-1 rounded p-1.5 ${
                  enabled ? 'hover:bg-neutral-700' : 'cursor-not-allowed opacity-40'
                } ${active ? 'bg-sky-900/60' : ''}`}
              >
                {Array.from({ length: n }, (_, i) => (
                  <Tile key={i} color={color} selected={active} />
                ))}
              </button>
            );
          })}
          {isCenter && state.center_has_token && <FirstToken />}
          {colors.length === 0 && !(isCenter && state.center_has_token) && (
            <span className="text-xs text-neutral-600">empty</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: NUM_DISPLAYS }, (_, i) =>
        group(i, state.displays[i] ?? new Array(NUM_COLORS).fill(0)),
      )}
      {group(CENTER, state.center)}
    </div>
  );
}
