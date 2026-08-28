import { CENTER, NUM_DISPLAYS, tileList, sourceLabel } from "../types/game";
import type { Color, GameStateView } from "../types/game";
import { FirstToken, Tile } from "./Tile";

export interface Selection {
  source: number;
  color: Color;
}

/** Sources are clickable only when some legal action starts from them. */
export function DisplayArea({
  state,
  selection,
  selectable,
  onPick,
}: {
  state: GameStateView;
  selection: Selection | null;
  selectable: (source: number, color: Color) => boolean;
  onPick: (source: number, color: Color) => void;
}) {
  const group = (source: number, counts: Record<string, number | undefined>) => {
    const tiles = tileList(counts);
    const colors = Array.from(new Set(tiles));
    return (
      <div key={source} className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-2">
        <div className="mb-1 text-xs text-neutral-400">{sourceLabel(source)}</div>
        <div className="flex flex-wrap gap-1">
          {colors.length === 0 && source !== CENTER && (
            <span className="text-xs text-neutral-600">空</span>
          )}
          {colors.map((color) => {
            const n = tiles.filter((t) => t === color).length;
            const ok = selectable(source, color);
            const active = selection?.source === source && selection.color === color;
            return (
              <button
                key={color}
                disabled={!ok}
                onClick={() => onPick(source, color)}
                className={`flex gap-1 rounded p-1 ${
                  ok ? "hover:bg-neutral-700" : "opacity-40 cursor-not-allowed"
                } ${active ? "bg-sky-900/60" : ""}`}
                title={ok ? `取走 ${n} 块` : "无合法落点"}
              >
                {Array.from({ length: n }).map((_, i) => (
                  <Tile key={i} color={color} selected={active} />
                ))}
              </button>
            );
          })}
          {source === CENTER && state.center_has_token && <FirstToken />}
          {source === CENTER && colors.length === 0 && !state.center_has_token && (
            <span className="text-xs text-neutral-600">空</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {Array.from({ length: NUM_DISPLAYS }, (_, i) => group(i, state.displays[i] ?? {}))}
      {group(CENTER, state.center)}
    </div>
  );
}
