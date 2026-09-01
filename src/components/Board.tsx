import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { useIdentity } from '../auth/clerk';
import { useGameStyle } from '../context/GameStyleContext';
import { COLOR_NAMES, NUM_COLORS } from '../engine';
import type { Session } from '../game/useGameSession';
import { DisplayArea } from './DisplayArea';
import { COLOR_DOTS } from './GameHeader';
import { GameOverBurst } from './GameOverBurst';
import { PlayerBoard } from './PlayerBoard';
import { getBadgeSrc, HumanAvatar, RobotAvatar } from './RobotAvatar';



/**
 * 3-Column Game Surface:
 * - Left: TopLeft info (title/seed/status) + Your Profile & Board
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
  title,
}: {
  session: Session;
  humanLabel?: string;
  opponentLabel?: string;
  onUndo?: () => void;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  title?: ReactNode;
}) {
  const identity = useIdentity();
  const playerDisplayName = humanLabel !== 'You' ? humanLabel : (identity.displayName || 'You');
  const root = useRef<HTMLDivElement>(null);
  const { clearSelection, humanSeat, game, status } = session;
  const triggerUndo = onUndo ?? session.undo;
  // Undo is a Practice-only affordance; Daily runs without it (maxUndos: 0).
  const undoEnabled = session.maxUndos > 0;

  const opponentSeat = 1 - humanSeat;
  const humanBoard = game.state.players[humanSeat];
  const opponentBoard = game.state.players[opponentSeat];
  const currentRound = game.state.round_num;
  const isHumanTurn = status === 'idle' || status === 'your-turn';
  const isOpponentTurn = status === 'ai-thinking';
  const { style } = useGameStyle();

  // Render player avatar based on style
  const renderHumanAvatar = () => {
    if (style === 'focus') return null;
    return <HumanAvatar color="sky" />;
  };

  // Render opponent avatar based on style
  const renderOpponentAvatar = () => {
    if (style === 'focus') return null;
    if (style === 'classic') return <RobotAvatar level={opponentLabel} />;
    return <HumanAvatar color="rose" />;
  };

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

      {/* Top Header / Controls Container */}
      <div className="w-full max-w-7xl mx-auto mb-2 px-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="hidden md:block">
          {topLeft ?? (
            style === 'focus' ? (
              <div className="flex items-center text-xs font-semibold text-neutral-400 px-1 py-1">
                Round {currentRound}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 rounded-full border border-neutral-700/60 bg-neutral-900/60 px-3.5 py-1.5 shadow-sm backdrop-blur-sm w-fit">
                <div className="rounded-full border border-sky-400/20 bg-sky-950/60 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-sky-300 shadow-sm">
                  Round {currentRound}
                </div>
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
            )
          )}
        </div>
        {topLeft && <div className="md:hidden">{topLeft}</div>}
        {topRight && <div className="ml-auto">{topRight}</div>}
      </div>

      {/* Header Bar: Displays round, timer/controls, scores and avatars */}
      <div className="w-full max-w-7xl mx-auto mb-3">
        {/* Mobile / Compact Top Bar (< md) */}
        <div className="flex md:hidden flex-col gap-2 w-full max-w-[420px] mx-auto">
          <header className="flex w-full items-center justify-between px-1 py-1">
            {/* Left: You */}
            <div className="flex items-center gap-2">
              {renderHumanAvatar()}
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-neutral-400 truncate max-w-[110px]">
                  {playerDisplayName}
                </span>
                <span
                  className={`text-2xl font-black tabular-nums leading-none ${
                    style === 'focus' ? 'text-neutral-300' : 'text-sky-400'
                  }`}
                >
                  {humanBoard.score}
                </span>
                <div
                  className={`h-1 w-7 rounded-full mt-1 transition-all ${
                    isHumanTurn
                      ? style === 'focus'
                        ? 'bg-neutral-500'
                        : 'bg-sky-400 shadow-sm shadow-sky-400/80'
                      : 'bg-transparent'
                  }`}
                />
              </div>
            </div>

            {/* Center: Round Badge */}
            {style === 'focus' ? (
              <div className="text-xs font-semibold text-neutral-400">
                Round {currentRound}
              </div>
            ) : (
              <div className="rounded-full border border-sky-400/20 bg-sky-950/40 px-3 py-1 text-xs font-semibold text-sky-300 backdrop-blur-sm shadow-sm">
                Round {currentRound}
              </div>
            )}

            {/* Right: Opponent */}
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end">
                <span className="text-xs font-semibold text-neutral-400">{opponentLabel}</span>
                <span
                  className={`text-2xl font-black tabular-nums leading-none ${
                    style === 'focus' ? 'text-neutral-300' : 'text-rose-400'
                  }`}
                >
                  {opponentBoard.score}
                </span>
                <div
                  className={`h-1 w-7 rounded-full mt-1 transition-all ${
                    isOpponentTurn
                      ? style === 'focus'
                        ? 'bg-neutral-500'
                        : 'bg-rose-500 shadow-sm shadow-rose-400/80'
                      : 'bg-transparent'
                  }`}
                />
              </div>
              {renderOpponentAvatar()}
            </div>
          </header>
        </div>
      </div>

      {/* Main Game Grid: 3 columns on tablet/desktop (>= md), single column stacked on mobile (< md) */}
      <div className="flex flex-col md:grid md:grid-cols-[minmax(0,390px)_1fr_minmax(0,390px)] gap-3 sm:gap-4 lg:gap-6 items-center md:items-start w-full justify-center max-w-[420px] md:max-w-none mx-auto">

        {/* Human / Your Section: 2nd on Mobile, Left Column on Desktop (md:order-1) */}
        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 w-full max-w-[390px] order-2 md:order-1">
          {/* Desktop Human Profile */}
          <div className="hidden md:flex flex-col gap-2.5 w-full">
            <div className="flex items-center justify-between rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm min-h-[58px]">
              <div className="flex items-center justify-between w-full gap-2">
                {renderHumanAvatar()}
                {undoEnabled && (
                  <button
                    type="button"
                    onClick={triggerUndo}
                    disabled={!session.canUndo}
                    aria-label={`Undo last move (${session.undosRemaining} remaining)`}
                    title={`Undo last move (${session.undosRemaining} remaining)`}
                    className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 shadow-sm transition hover:bg-sky-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
                )}
                <div className="flex flex-col items-end">
                  <span
                    className={`text-[11px] sm:text-xs font-semibold tracking-wide uppercase truncate max-w-[160px] ${
                      style === 'focus' ? 'text-neutral-400' : 'text-sky-400'
                    }`}
                  >
                    {playerDisplayName}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight ${
                        style === 'focus' ? 'text-neutral-300' : 'text-sky-400'
                      }`}
                    >
                      {humanBoard.score}
                    </span>
                  </div>
                  <div
                    className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
                      isHumanTurn
                        ? style === 'focus'
                          ? 'bg-neutral-500'
                          : 'bg-sky-500 shadow-sm shadow-sky-400/50'
                        : 'bg-transparent'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          <PlayerBoard
            board={humanBoard}
            label={playerDisplayName}
            active={isHumanTurn}
            interactive
            session={session}
          />
        </div>

        {/* Center / Factories Section: 3rd on Mobile, Center Column on Desktop (md:order-2) */}
        <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-0 w-full order-3 md:order-2">
          <DisplayArea session={session} title={title} />
        </div>

        {/* Opponent Section on Mobile (Top), Right Column on Desktop (md:order-3) */}
        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 w-full max-w-[390px] order-1 md:order-3 md:justify-self-start">
          {/* Desktop Opponent Header */}
          <div className="hidden md:block w-full">
            <div className="flex items-center justify-between rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm min-h-[58px]">
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col items-start">
                  <span
                    className={`text-[11px] sm:text-xs font-semibold tracking-wide uppercase ${
                      style === 'focus' ? 'text-neutral-400' : 'text-rose-400'
                    }`}
                  >
                    {opponentLabel}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight ${
                        style === 'focus' ? 'text-neutral-300' : 'text-rose-400'
                      }`}
                    >
                      {opponentBoard.score}
                    </span>
                  </div>
                  <div
                    className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
                      isOpponentTurn
                        ? style === 'focus'
                          ? 'bg-neutral-500'
                          : 'bg-rose-500 shadow-sm shadow-rose-400/50'
                        : 'bg-transparent'
                    }`}
                  />
                </div>
                {renderOpponentAvatar()}
              </div>
            </div>
          </div>

          <PlayerBoard
            board={opponentBoard}
            label={opponentLabel}
            active={isOpponentTurn}
            interactive={false}
            session={session}
            badgeOverlay={
              style === 'classic' ? (
                <div
                  className="hidden md:flex lg:flex absolute inset-0 items-center justify-end pointer-events-none select-none z-0 overflow-hidden pr-1"
                  aria-hidden="true"
                >
                  <img
                    src={getBadgeSrc(opponentLabel)}
                    alt=""
                    className="w-44 sm:w-52 h-auto max-w-none object-contain pr-9 opacity-70 drop-shadow-xl translate-x-2"
                  />
                </div>
              ) : undefined
            }
          />
        </div>

        {/* Mobile Turn / Action Card with Undo (order-4 on mobile, hidden on desktop) */}
        <div className="flex md:hidden w-full max-w-[390px] order-4 rounded-2xl border border-sky-400/30 bg-sky-950/20 p-3 shadow-md backdrop-blur-sm items-center justify-between gap-3">
          <div className="flex flex-col">
            <h3 className="text-sm font-bold text-sky-300">
              {status === 'ai-thinking'
                ? `${opponentLabel}'s turn`
                : session.selection
                  ? 'Place Tiles'
                  : 'Your turn'}
            </h3>
            <p className="text-xs text-neutral-300 mt-0.5">
              {status === 'ai-thinking'
                ? `${opponentLabel} is thinking…`
                : session.selection
                  ? 'Choose a staging row on your board or the floor line.'
                  : 'Pick a tile from a factory or from the center.'}
            </p>
          </div>

          {undoEnabled && (
          <button
            type="button"
            onClick={triggerUndo}
            disabled={!session.canUndo}
            data-testid="mobile-undo-button"
            className="inline-flex lg:hidden shrink-0 items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-950/60 px-3 py-2 text-xs font-semibold text-sky-200 shadow-sm transition hover:bg-sky-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
            <span>Revert ({session.undosRemaining})</span>
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
