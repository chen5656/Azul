import type { ReactNode } from 'react';

/**
 * The pieces of the game surface. `Board` builds each one exactly once and
 * hands the whole set to a shell; a shell mounts only the pieces its
 * arrangement uses, so nothing is ever rendered twice into the DOM. That
 * matters beyond tidiness: the tile animator locates elements with
 * `querySelector('[data-anim-id=…]')`, and a hidden duplicate would silently
 * win the lookup and animate to a zero-sized rect.
 */
export interface BoardSlots {
  /** Rich round/palette indicator (desktop). */
  infoBar: ReactNode;
  /** Compact round badge (stacked). */
  roundBadge: ReactNode;
  /** Route-supplied controls: timer, restart, difficulty… */
  controls: ReactNode;
  /** Back to home — stacked only, where the app chrome is hidden. */
  back: ReactNode;
  undo: ReactNode;
  humanProfile: ReactNode;
  opponentProfile: ReactNode;
  youBoard: ReactNode;
  opponentBoard: ReactNode;
  center: ReactNode;
  /** Whose-turn hint, shown where there is no profile column to carry it. */
  actionCard: ReactNode;
}

/** Desktop: opponent on the left, factories in the middle, you on the right. */
export function WideLayout({
  infoBar,
  controls,
  humanProfile,
  opponentProfile,
  youBoard,
  opponentBoard,
  center,
}: BoardSlots) {
  return (
    <>
      <div className="w-full max-w-7xl mx-auto mb-2 px-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        {infoBar}
        {controls && <div className="ml-auto">{controls}</div>}
      </div>

      {/*
        Proportional columns, not fixed ones: the factories are ~10 tiles wide
        just like a board, so the middle needs a real share of the width rather
        than whatever the two boards leave behind.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(340px,1.15fr)_minmax(0,1fr)] gap-3 sm:gap-4 lg:gap-6 items-start w-full justify-center mx-auto">
        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 w-full justify-self-end">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm min-h-[58px]">
            {opponentProfile}
          </div>
          {opponentBoard}
        </div>

        <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0 w-full">{center}</div>

        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 w-full">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm min-h-[58px]">
            {humanProfile}
          </div>
          {youBoard}
        </div>
      </div>
    </>
  );
}

/**
 * Phone and tablet: one column — factories on top, then each board full width.
 * The app's global nav is hidden in this shell, so a back link and the route's
 * own controls share one slim row and everything else goes to the game.
 */
export function StackedLayout({
  roundBadge,
  controls,
  back,
  undo,
  youBoard,
  opponentBoard,
  center,
  actionCard,
}: BoardSlots) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-2 px-0.5">
        {back}
        {roundBadge}
        {controls && <div className="azul-compact-controls ml-auto min-w-0">{controls}</div>}
      </div>

      <section className="azul-factory-band rounded-2xl border border-neutral-800/80 bg-neutral-900/40 px-2 py-1.5">
        {center}
      </section>

      {opponentBoard}
      {youBoard}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-400/30 bg-sky-950/20 px-3 py-1.5 shadow-md backdrop-blur-sm">
        {actionCard}
        {undo}
      </div>
    </div>
  );
}
