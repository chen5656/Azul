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
  const isHuman = interactive || label.toLowerCase().includes('you');

  return (
    <section
      aria-label={label}
      className={`azul-board flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 shadow-md backdrop-blur-sm transition-all max-w-[390px] w-full ${
        active
          ? isHuman
            ? 'border-sky-400/80 bg-neutral-900/80 ring-1 ring-sky-500/40 shadow-sky-500/10'
            : 'border-rose-400/80 bg-neutral-900/80 ring-1 ring-rose-500/40 shadow-rose-500/10'
          : 'border-neutral-700/60 bg-neutral-900/60'
      }`}
    >
      <header className="mb-2 sm:mb-2.5 flex items-baseline justify-between gap-2">
        <span
          className={`text-sm font-semibold tracking-wide ${
            isHuman ? 'text-sky-400' : 'text-rose-400'
          }`}
        >
          {isHuman ? 'Your Board' : 'Opponent Board'}
          {board.has_first_token && (
            <span className="ml-2 rounded bg-sky-950/70 px-1.5 py-0.5 text-[10px] font-normal text-sky-300 ring-1 ring-sky-400/40">
              goes first next round
            </span>
          )}
        </span>
        <span className="tabular-nums text-base font-bold text-neutral-300">
          {board.score} pts
        </span>
      </header>

      {/* Staging Rows & 5x5 Grid */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* Staging Rows (1 to 5) */}
        <div className="flex flex-col gap-1.5">
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
                data-tutorial-target={interactive ? `row-${row}` : undefined}
                disabled={!ok}
                onClick={() => place(row)}
                aria-label={`Staging row ${row + 1}${p ? `, places ${p.placed} tiles` : ''}`}
                title={p ? `${p.placed} on the row, ${p.overflow} to the penalty row` : undefined}
                className={`flex justify-end gap-1 rounded-md p-1 transition-all ${
                  ok
                    ? 'bg-sky-900/50 ring-2 ring-sky-400 shadow-sm hover:bg-sky-800/70'
                    : ''
                } ${interactive && selection && !ok ? 'opacity-40' : ''} ${
                  lit('row', row) ? 'ring-2 ring-sky-400' : ''
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

        {/* 5x5 Grid */}
        <div
          data-tutorial-target={interactive ? 'wall' : undefined}
          className={`flex flex-col gap-1.5 rounded-lg border border-neutral-700/40 bg-neutral-950/40 p-1.5 ${
            lit('wall') ? 'ring-2 ring-sky-400' : ''
          }`}
          aria-label="Grid"
        >
          {Array.from({ length: NUM_ROWS }, (_, row) => (
            <div key={row} className="flex gap-1">
              {Array.from({ length: GRID_SIZE }, (_, col) => {
                const color = GRID_COLOR[row][col];
                return board.grid[row][col] ? (
                  <Tile key={col} color={color} size="sm" />
                ) : (
                  <div
                    key={col}
                    className="azul-tile grid place-items-center rounded border border-neutral-800/80 bg-neutral-900/20 text-neutral-600 font-semibold"
                  >
                    {['B', 'Y', 'R', 'K', 'W'][color]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Penalty / Floor Row */}
      <button
        type="button"
        data-tutorial-target={interactive ? 'floor' : undefined}
        disabled={!drop(PENALTY_DEST)}
        onClick={() => place(PENALTY_DEST)}
        aria-label="Penalty row — discard the whole group here"
        className={`mt-2 sm:mt-2.5 flex w-full items-center justify-between rounded-lg border border-neutral-700/50 bg-neutral-950/40 p-1.5 transition-all ${
          drop(PENALTY_DEST)
            ? 'border-red-500 bg-red-950/50 ring-2 ring-red-500 shadow-sm hover:bg-red-900/60'
            : interactive && selection
            ? 'opacity-40'
            : ''
        } ${lit('floor') ? 'ring-2 ring-sky-400' : ''}`}
      >
        <div className="flex items-center gap-1 sm:gap-1.5">
          {PENALTIES.map((points, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center rounded border border-neutral-700/60 bg-neutral-900/60 px-1 py-0.5"
            >
              <PenaltySlot tile={board.penalty_tiles[i]} size="sm" />
              <span className="mt-0.5 text-[10px] font-medium text-neutral-400">
                {points}
              </span>
            </div>
          ))}
        </div>
        <span className="pr-1 text-xs tabular-nums text-red-400 font-semibold">
          {board.penalty_tiles.length > 0 && penaltyTotal}
          {board.penalty_overflow > 0 && (
            <span className="ml-1 text-[10px] text-neutral-400">
              +{board.penalty_overflow}
            </span>
          )}
        </span>
      </button>
    </section>
  );
}
