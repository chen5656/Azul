import type { ReactNode } from 'react';

import { useGameStyle } from '../context/GameStyleContext';
import {
  COLOR_INITIALS,
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
import { PenaltySlot, Tile, WALL_PLAIN, WALL_TINT } from './Tile';

/**
 * One player's board: staging rows, the grid, the penalty row.
 *
 * `interactive` is false for the opponent's board — destinations only ever exist
 * on the human's own board.
 *
 * Two arrangements of the same parts:
 * - `panel` (desktop column): title on top, staging + grid, penalty row below.
 * - `stacked` (phone/tablet): name and score share the header with the penalty
 *   row, so the board itself gets the whole width of the panel.
 */
export function PlayerBoard({
  board,
  label,
  active,
  interactive,
  session,
  seat,
  badgeOverlay,
  variant = 'panel',
  score,
}: {
  board: PlayerBoardState;
  label: string;
  active: boolean;
  interactive: boolean;
  session: Session;
  seat?: number;
  badgeOverlay?: ReactNode;
  variant?: 'panel' | 'stacked';
  score?: number;
}) {
  const { style } = useGameStyle();
  const isFocus = style === 'focus';
  const { canPlace, place, previewFor, selection, spotlight } = session;
  const drop = (dest: number) => interactive && canPlace(dest);
  const playerSeat = seat ?? (interactive ? session.humanSeat : 1 - session.humanSeat);
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
  const isStacked = variant === 'stacked';

  const accent = isFocus ? 'text-neutral-400' : isHuman ? 'text-sky-400' : 'text-rose-400';

  const stagingRows = (
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
            data-anim-id={`stage-row-${playerSeat}-${row}`}
            data-tutorial-target={interactive ? `row-${row}` : undefined}
            disabled={!ok}
            onClick={() => place(row)}
            aria-label={`Staging row ${row + 1}${p ? `, places ${p.placed} tiles` : ''}`}
            title={p ? `${p.placed} on the row, ${p.overflow} to the penalty row` : undefined}
            className={`flex justify-end gap-1 rounded-md p-1 transition-all ${
              !isFocus && ok
                ? 'bg-sky-900/50 ring-2 ring-sky-400 shadow-sm hover:bg-sky-800/70'
                : ''
            } ${!isFocus && interactive && selection && !ok ? 'opacity-40' : ''} ${
              lit('row', row) ? 'ring-2 ring-sky-400' : ''
            }`}
          >
            {Array.from({ length: capacity }, (_, slot) => {
              const filled = slot >= capacity - count;
              return (
                <Tile
                  key={slot}
                  animId={`stage-${playerSeat}-${row}-${slot}`}
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
  );

  const wall = (
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
              <Tile key={col} animId={`wall-${playerSeat}-${row}-${col}`} color={color} size="sm" />
            ) : (
              <div
                key={col}
                data-anim-id={`wall-${playerSeat}-${row}-${col}`}
                className={`azul-tile grid place-items-center rounded border font-semibold ${
                  isFocus ? WALL_PLAIN : WALL_TINT[color]
                }`}
              >
                {COLOR_INITIALS[color]}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const penaltyRow = (
    <button
      type="button"
      data-anim-id={`floor-row-${playerSeat}`}
      data-tutorial-target={interactive ? 'floor' : undefined}
      disabled={!drop(PENALTY_DEST)}
      onClick={() => place(PENALTY_DEST)}
      aria-label="Penalty row — discard the whole group here"
      className={`azul-penalty-row flex items-center justify-between gap-1 rounded-lg border border-neutral-700/50 bg-neutral-950/40 p-1.5 transition-all ${
        isStacked ? 'min-w-0 shrink' : 'mt-2 sm:mt-2.5 w-full'
      } ${
        !isFocus && drop(PENALTY_DEST)
          ? 'border-red-500 bg-red-950/50 ring-2 ring-red-500 shadow-sm hover:bg-red-900/60'
          : !isFocus && interactive && selection
          ? 'opacity-40'
          : ''
      } ${lit('floor') ? 'ring-2 ring-sky-400' : ''}`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5">
        {PENALTIES.map((points, i) => (
          <div
            key={i}
            data-anim-id={`floor-${playerSeat}-${i}`}
            className="flex flex-col items-center justify-center rounded border border-neutral-700/60 bg-neutral-900/60 px-1 py-0.5"
          >
            <PenaltySlot animId={`floor-${playerSeat}-${i}`} tile={board.penalty_tiles[i]} size="sm" />
            <span className="mt-0.5 text-[10px] font-medium text-neutral-400">{points}</span>
          </div>
        ))}
      </div>
      <span className="pr-1 text-xs tabular-nums text-red-400 font-semibold">
        {board.penalty_tiles.length > 0 && penaltyTotal}
        {board.penalty_overflow > 0 && (
          <span className="ml-1 text-[10px] text-neutral-400">+{board.penalty_overflow}</span>
        )}
      </span>
    </button>
  );

  return (
    <section
      aria-label={label}
      data-anim-id={`board-${playerSeat}`}
      className={`azul-board ${isStacked ? 'azul-board-stacked' : ''} relative overflow-hidden flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 shadow-md backdrop-blur-sm transition-all w-full ${
        isStacked ? '' : 'azul-board-panel'
      } ${
        active
          ? isHuman
            ? 'border-sky-400/80 bg-neutral-900/80 ring-1 ring-sky-500/40 shadow-sky-500/10'
            : 'border-rose-400/80 bg-neutral-900/80 ring-1 ring-rose-500/40 shadow-rose-500/10'
          : 'border-neutral-700/60 bg-neutral-900/60'
      }`}
    >
      {/* Background layer (behind all board content) */}
      {badgeOverlay}

      {/* Board Content (z-10) */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        <header
          className={`mb-2 sm:mb-2.5 flex gap-2 ${
            isStacked ? 'items-center justify-between' : 'items-baseline justify-between'
          }`}
        >
          {isStacked ? (
            <div className="flex shrink-0 flex-col leading-tight">
              <span className={`max-w-[7rem] truncate text-sm font-semibold tracking-wide ${accent}`}>
                {label}
              </span>
              <span
                className={`text-xl font-black tabular-nums ${
                  isFocus ? 'text-neutral-300' : isHuman ? 'text-sky-300' : 'text-rose-300'
                }`}
              >
                {score ?? board.score}
              </span>
            </div>
          ) : (
            <span className={`text-sm font-semibold tracking-wide ${accent}`}>
              {isHuman ? 'Your Board' : 'Opponent Board'}
            </span>
          )}
          {isStacked && penaltyRow}
        </header>

        {/* Staging Rows & 5x5 Grid */}
        {/* Stacked keeps the staircase next to the wall; the desktop column has
            no room to spare and pushes them to the panel edges. */}
        <div
          className={`flex items-center gap-2 sm:gap-3 ${
            isStacked ? 'justify-center' : 'justify-between'
          }`}
        >
          {stagingRows}
          {wall}
        </div>

        {!isStacked && penaltyRow}
      </div>
    </section>
  );
}
