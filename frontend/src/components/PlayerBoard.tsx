import { COLORS, NUM_ROWS, PENALTIES, PENALTY_DEST, STAGING_CAPACITY } from "../types/game";
import type { Color, PlayerView } from "../types/game";
import { FirstToken, Tile } from "./Tile";

/** Grid color at (row, col) — must match engine/constants.py grid_color(). */
function gridColor(row: number, col: number): Color {
  return COLORS[(col - row + COLORS.length) % COLORS.length];
}

export function PlayerBoard({
  board,
  index,
  label,
  active,
  legalDest,
  onDrop,
}: {
  board: PlayerView;
  index: number;
  label: string;
  active: boolean;
  /** null when this board cannot receive the current selection at all. */
  legalDest: ((dest: number) => boolean) | null;
  onDrop: (dest: number) => void;
}) {
  const canDrop = (dest: number) => (legalDest ? legalDest(dest) : false);
  const penaltyTotal = PENALTIES.slice(0, board.penalty_tiles.length).reduce((a, b) => a + b, 0);

  return (
    <div
      className={`rounded-xl border p-3 ${
        active ? "border-sky-400 bg-neutral-800/70" : "border-neutral-700 bg-neutral-800/30"
      }`}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold">
          P{index} {label}
          {board.has_first_token && <span className="ml-2 text-xs text-sky-300">先手</span>}
        </span>
        <span className="tabular-nums text-lg">{board.score} 分</span>
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col gap-1">
          {Array.from({ length: NUM_ROWS }, (_, r) => {
            const capacity = STAGING_CAPACITY[r];
            const color = board.staging_colors[r];
            const count = board.staging_counts[r];
            const ok = canDrop(r);
            return (
              <button
                key={r}
                disabled={!ok}
                onClick={() => onDrop(r)}
                className={`flex justify-end gap-1 rounded p-1 ${
                  ok ? "bg-sky-900/40 ring-1 ring-sky-500 hover:bg-sky-800/60" : ""
                } ${legalDest && !ok ? "opacity-50" : ""}`}
                title={ok ? `放入备料行 ${r + 1}` : ""}
              >
                {Array.from({ length: capacity }, (_, slot) => {
                  const filled = slot >= capacity - count;
                  return (
                    <Tile
                      key={slot}
                      color={filled && color ? color : undefined}
                      empty={!filled || !color}
                      size="sm"
                    />
                  );
                })}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1">
          {Array.from({ length: NUM_ROWS }, (_, r) => (
            <div key={r} className="flex gap-1 p-1">
              {Array.from({ length: COLORS.length }, (_, c) => {
                const color = gridColor(r, c);
                return board.grid[r][c] ? (
                  <Tile key={c} color={color} size="sm" />
                ) : (
                  <div
                    key={c}
                    className="grid h-5 w-5 place-items-center rounded border border-neutral-700 text-[8px] text-neutral-600"
                  >
                    {color[0].toUpperCase()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <button
        disabled={!canDrop(PENALTY_DEST)}
        onClick={() => onDrop(PENALTY_DEST)}
        className={`mt-3 flex w-full items-center gap-1 rounded p-1 ${
          canDrop(PENALTY_DEST)
            ? "bg-red-900/40 ring-1 ring-red-500 hover:bg-red-800/60"
            : legalDest
              ? "opacity-50"
              : ""
        }`}
        title="整组弃入罚分行"
      >
        {PENALTIES.map((points, i) => {
          const tile = board.penalty_tiles[i];
          return (
            <span key={i} className="flex flex-col items-center">
              {tile === "first_token" ? (
                <FirstToken size="sm" />
              ) : (
                <Tile color={tile as Color | undefined} empty={!tile} size="sm" />
              )}
              <span className="text-[9px] text-neutral-500">{points}</span>
            </span>
          );
        })}
        <span className="ml-auto text-xs text-red-300">
          {board.penalty_tiles.length > 0 && penaltyTotal}
          {board.penalty_overflow > 0 && (
            <span className="ml-1 text-neutral-500">(+{board.penalty_overflow} 弃)</span>
          )}
        </span>
      </button>
    </div>
  );
}
