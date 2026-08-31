import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { COLOR_NAMES, NUM_COLORS } from '../engine';
import type { Session } from '../game/useGameSession';
import { DisplayArea } from './DisplayArea';
import { COLOR_DOTS, FoxAvatar, RaccoonAvatar } from './GameHeader';
import { GameOverBurst } from './GameOverBurst';
import { PlayerBoard } from './PlayerBoard';
import { ScoreBreakdown } from './ScoreBreakdown';

/**
 * 3-Column Game Surface:
 * - Left: TopLeft info (title/seed/status) + Your Profile & Board + Score Breakdown
 * - Center: Round & Palette Indicators + Factories & Center Pool
 * - Right: TopRight controls (restart/deal/setup) + Opponent Profile & Board + Turn & Action Card
 */
export function Board({
  session,
  humanLabel = 'You',
  opponentLabel = 'Opponent',
  onUndo,
  topLeft,
  topRight,
}: {
  session: Session;
  humanLabel?: string;
  opponentLabel?: string;
  onUndo?: () => void;
  topLeft?: ReactNode;
  topRight?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { clearSelection, humanSeat, game, status } = session;
  const triggerUndo = onUndo ?? session.undo;

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (session.canUndo) {
          event.preventDefault();
          triggerUndo();
        }
        return;
      }
      if (event.key === 'u' || event.key === 'U') {
        const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && session.canUndo) {
          event.preventDefault();
          triggerUndo();
          return;
        }
      }
      if (!event.key.startsWith('Arrow')) return;

      const focusable = Array.from(
        node.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      const here = focusable.indexOf(document.activeElement as HTMLButtonElement);
      if (here < 0) {
        focusable[0]?.focus();
        event.preventDefault();
        return;
      }
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = (here + step + focusable.length) % focusable.length;
      focusable[next]?.focus();
      event.preventDefault();
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, session, triggerUndo]);

  const opponentSeat = 1 - humanSeat;
  const humanBoard = game.state.players[humanSeat];
  const opponentBoard = game.state.players[opponentSeat];
  const currentRound = game.state.round_num;
  const isHumanTurn = status === 'idle' || status === 'your-turn';
  const isOpponentTurn = status === 'ai-thinking';
  const isGameOver = status === 'game-over';
  const gameResult = isGameOver ? game.result() : null;

  return (
    <div ref={root} className="azul-main-layout w-full max-w-full">
      {isGameOver && gameResult && (
        <GameOverBurst
          text={gameResult.draw ? 'Draw' : session.humanWon ? 'You win' : 'You lose'}
          tone={gameResult.draw ? 'draw' : session.humanWon ? 'win' : 'lose'}
        />
      )}
      {/* Screen-reader accessible live status */}
      <div role="status" className="sr-only">
        {status === 'game-over'
          ? (gameResult?.draw ? 'Draw' : session.humanWon ? 'You win' : `${opponentLabel} wins`)
          : isOpponentTurn
          ? `${opponentLabel} is thinking…`
          : isHumanTurn
          ? 'Your turn'
          : ''}
      </div>

      {/* 3-Column Game Surface */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,390px)_1fr_minmax(0,390px)] gap-3 sm:gap-4 lg:gap-6 items-start w-full justify-center">
        {/* Left Column: Round & Palette Badge + Your Profile + Your Board + Score Breakdown */}
        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 w-full max-w-[390px] mx-auto lg:mx-0 lg:justify-self-end">
          {topLeft ? (
            <div className="flex flex-col gap-1.5 w-full">{topLeft}</div>
          ) : (
            /* Round & Color Indicator Badge */
            <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 rounded-full border border-neutral-700/60 bg-neutral-900/60 px-3.5 py-1.5 shadow-sm backdrop-blur-sm w-fit">
              <div className="rounded-full border border-sky-400/20 bg-sky-950/60 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-sky-300 shadow-sm">
                Round {currentRound}
              </div>
              {/* Progress dots for rounds */}
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }, (_, i) => {
                  const active = i < Math.min(5, currentRound);
                  const isCurrent = i === (currentRound - 1) % 5;
                  return (
                    <div
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-all ${
                        isCurrent
                          ? 'bg-sky-400 scale-125 shadow-sm shadow-sky-400/80'
                          : active
                          ? 'bg-sky-500/60'
                          : 'bg-neutral-700/60'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="h-3 w-px bg-neutral-700/60" />
              {/* Color Palette Indicators */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: NUM_COLORS }, (_, c) => (
                  <div
                    key={c}
                    className={`h-2.5 w-2.5 rounded-full shadow-sm ring-1 ${COLOR_DOTS[c]}`}
                    title={COLOR_NAMES[c]}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Human Profile Card */}
          <div className="flex items-center justify-between rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between w-full gap-2">
              <FoxAvatar />
              <button
                type="button"
                onClick={triggerUndo}
                disabled={!session.canUndo}
                aria-label={`Undo last move (${session.undosRemaining} remaining)`}
                title={`Undo last move (${session.undosRemaining} remaining)`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 shadow-sm transition hover:bg-sky-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 stroke-current"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                </svg>
                <span>Undo ({session.undosRemaining})</span>
              </button>
              <div className="flex flex-col items-end">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-sky-400 uppercase">
                  {humanLabel}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight text-sky-400">
                    {humanBoard.score}
                  </span>
                </div>
                <div
                  className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
                    isHumanTurn ? 'bg-sky-500 shadow-sm shadow-sky-400/50' : 'bg-transparent'
                  }`}
                />
              </div>
            </div>
          </div>

          <PlayerBoard
            board={humanBoard}
            label={humanLabel}
            active={isHumanTurn}
            interactive
            session={session}
          />
          <ScoreBreakdown board={humanBoard} tone="sky" />
        </div>

        {/* Center Column: Factories & Center Pool */}
        <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0 w-full">
          <DisplayArea session={session} />
        </div>

        {/* Right Column: Action controls + Opponent Profile + Opponent Board + Score Breakdown */}
        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 w-full max-w-[390px] mx-auto lg:mx-0 lg:justify-self-start">
          {topRight && <div className="flex flex-wrap items-center justify-end gap-2 w-full">{topRight}</div>}

          {/* Opponent Profile Card */}
          <div className="flex items-center justify-between rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col items-start">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-rose-400 uppercase">
                  {opponentLabel}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight text-rose-400">
                    {opponentBoard.score}
                  </span>
                </div>
                <div
                  className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
                    isOpponentTurn ? 'bg-rose-500 shadow-sm shadow-rose-400/50' : 'bg-transparent'
                  }`}
                />
              </div>
              <RaccoonAvatar />
            </div>
          </div>

          <PlayerBoard
            board={opponentBoard}
            label={opponentLabel}
            active={isOpponentTurn}
            interactive={false}
            session={session}
          />
          <ScoreBreakdown board={opponentBoard} tone="rose" />
        </div>
      </div>
    </div>
  );
}
