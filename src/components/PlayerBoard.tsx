import {
  GRID_COLOR,
  GRID_SIZE,
  NUM_ROWS,
  PENALTIES,
  PENALTY_DEST,
  PENALTY_TOTALS,
  STAGING_CAPACITY,
  type PlayerBoard as PlayerBoardState,
} from '../engine';
import type { Session } from '../game/useGameSession';
import type { Spotlight } from '../tutorial/script';
import { PenaltySlot, Tile } from './Tile';

/**
 * One player's board: staging rows, the grid, the penalty row.
 *
 * `interactive` is false for the opponent's board — destinations only ever exist
 * on the human's own board.
 */
export function PlayerBoard({
  board,
  label,
  active,
  interactive,
  session,
}: {
  board: PlayerBoardState;
  label: string;
  active: boolean;
  interactive: boolean;
  session: Session;
}) {
  const { canPlace, place, previewFor, selection, spotlight } = session;
  const drop = (dest: number) => interactive && canPlace(dest);
  /**
   * The tutorial rings one part of the board at a time. A real game leaves
   * `spotlight` unset, so this is always false there.
   */
  const lit = (kind: Spotlight['kind'], index?: number) =>
    interactive &&
    spotlight?.kind === kind &&
    (index === undefined || ('index' in spotlight && spotlight.index === index));
  const penaltyTotal = PENALTY_TOTALS[board.penalty_tiles.length];

  return (
    <section
      aria-label={label}
      className={`azul-board min-w-0 rounded-xl border p-3 ${
        active ? 'border-sky-400 bg-neutral-800/70' : 'border-neutral-700 bg-neutral-800/30'
      }`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold">
          {label}
          {board.has_first_token && (
            <span className="ml-2 text-xs font-normal text-sky-300">goes first next round</span>
          )}
        </span>
        <span className="tabular-nums text-lg">{board.score}</span>
      </header>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1">
          {Array.from({ length: NUM_ROWS }, (_, row) => {
            const capacity = STAGING_CAPACITY[row];
            const color = board.staging_colors[row];
            const count = board.staging_counts[row];
            const ok = drop(row);
            const p = ok ? previewFor(row) : null;
            return (
              <button
                key={row}
                type="button"
                disabled={!ok}
                onClick={() => place(row)}
                aria-label={`Staging row ${row + 1}${p ? `, places ${p.placed} tiles` : ''}`}
                title={p ? `${p.placed} on the row, ${p.overflow} to the penalty row` : undefined}
                className={`flex justify-end gap-1 rounded p-1.5 ${
                  ok ? 'bg-sky-900/40 ring-1 ring-sky-500 hover:bg-sky-800/60' : ''
                } ${interactive && selection && !ok ? 'opacity-50' : ''} ${
                  lit('row', row)
                    ? 'ring-2 ring-sky-400'
                    : ''
                }`}
              >
                {Array.from({ length: capacity }, (_, slot) => {
                  const filled = slot >= capacity - count;
                  return (
                    <Tile
                      key={slot}
                      color={filled ? color : undefined}
                      empty={!filled}
                      size="sm"
                    />
                  );
                })}
              </button>
            );
          })}
        </div>

        <div
          className={`flex flex-col gap-1 rounded ${
            lit('wall') ? 'ring-2 ring-sky-400' : ''
          }`}
          aria-label="Grid"
        >
          {Array.from({ length: NUM_ROWS }, (_, row) => (
            <div key={row} className="flex gap-1 p-1">
              {Array.from({ length: GRID_SIZE }, (_, col) => {
                const color = GRID_COLOR[row][col];
                return board.grid[row][col] ? (
                  <Tile key={col} color={color} size="sm" />
                ) : (
                  <div
                    key={col}
                    className="azul-tile grid place-items-center rounded border border-neutral-800 text-neutral-600"
                  >
                    {['B', 'Y', 'R', 'K', 'W'][color]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!drop(PENALTY_DEST)}
        onClick={() => place(PENALTY_DEST)}
        aria-label="Penalty row — discard the whole group here"
        className={`mt-3 flex w-full items-center gap-1 rounded p-1.5 ${
          drop(PENALTY_DEST)
            ? 'bg-red-900/40 ring-1 ring-red-500 hover:bg-red-800/60'
            : interactive && selection
              ? 'opacity-50'
              : ''
        } ${lit('floor') ? 'ring-2 ring-sky-400' : ''}`}
      >
        {PENALTIES.map((points, i) => (
          <span key={i} className="flex flex-col items-center">
            <PenaltySlot tile={board.penalty_tiles[i]} />
            <span className="text-[10px] text-neutral-500">{points}</span>
          </span>
        ))}
        <span className="ml-auto pr-1 text-xs tabular-nums text-red-300">
          {board.penalty_tiles.length > 0 && penaltyTotal}
          {board.penalty_overflow > 0 && (
            <span className="ml-1 text-neutral-500">+{board.penalty_overflow} discarded</span>
          )}
        </span>
      </button>
    </section>
  );
}
