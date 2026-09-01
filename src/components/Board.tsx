import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { useIdentity } from '../auth/clerk';
import { useGameStyle } from '../context/GameStyleContext';
import { COLOR_NAMES, NUM_COLORS } from '../engine';
import type { Session } from '../game/useGameSession';
import { Link } from '../router';
import { createAnimator } from './animator';
import { DisplayArea } from './DisplayArea';
import { COLOR_DOTS } from './GameHeader';
import { GameOverBurst } from './GameOverBurst';
import { StackedLayout, WideLayout, type BoardSlots } from './layouts';
import { PlayerBoard } from './PlayerBoard';
import { getBadgeSrc, HumanAvatar, RobotAvatar } from './RobotAvatar';
import { useLayoutMode } from './useLayoutMode';

function UndoIcon() {
  return (
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
  );
}

/**
 * The game surface. It builds every piece of the board once and lets the
 * active shell — three columns on desktop, one column on phone and tablet —
 * decide where the pieces go. See `layouts.tsx` for why the pieces are built
 * here rather than duplicated per breakpoint.
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
  const mode = useLayoutMode();
  const isStacked = mode === 'stacked';

  const opponentSeat = 1 - humanSeat;
  const humanBoard = game.state.players[humanSeat];
  const opponentBoard = game.state.players[opponentSeat];
  const currentRound = game.state.round_num;
  const isHumanTurn = status === 'idle' || status === 'your-turn';
  const isOpponentTurn = status === 'ai-thinking';
  const { style } = useGameStyle();

  /**
   * `useGameSession` returns a fresh object every render, so depending on
   * `session` here tore the animator down and rebuilt it on *every* render —
   * and `clear()` yanks the tiles that are mid-flight. Selecting a tile, the
   * state bump after a move and the timer tick all render during an animation,
   * so almost every flight was destroyed a frame or two after it started.
   * `setAnimator` is the stable identity to hold on to.
   */
  const { setAnimator } = session;
  useEffect(() => {
    if (!setAnimator) return;
    const animator = createAnimator(root, style);
    setAnimator(animator);
    return () => {
      animator.clear();
      setAnimator(null);
    };
  }, [setAnimator, style]);

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

  const turnUnderline = (active: boolean, tone: 'sky' | 'rose') => (
    <div
      className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
        active
          ? style === 'focus'
            ? 'bg-neutral-500'
            : tone === 'sky'
              ? 'bg-sky-500 shadow-sm shadow-sky-400/50'
              : 'bg-rose-500 shadow-sm shadow-rose-400/50'
          : 'bg-transparent'
      }`}
    />
  );

  const slots: BoardSlots = {
    infoBar: (
      <div>
        {topLeft ??
          (style === 'focus' ? (
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
          ))}
      </div>
    ),

    roundBadge: (
      <span className="shrink-0 rounded-full border border-sky-400/20 bg-sky-950/40 px-2.5 py-1 text-[11px] font-semibold text-sky-300 shadow-sm backdrop-blur-sm">
        Round {currentRound}
      </span>
    ),

    controls: topRight ?? null,

    back: (
      <Link
        to="/"
        aria-label="Back to home"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-700/70 bg-neutral-900/70 px-2 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 stroke-current"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span className="sr-only sm:not-sr-only">Back</span>
      </Link>
    ),

    undo: undoEnabled ? (
      <button
        type="button"
        onClick={triggerUndo}
        disabled={!session.canUndo}
        data-testid="undo-button"
        aria-label={`Undo last move (${session.undosRemaining} remaining)`}
        title={`Undo last move (${session.undosRemaining} remaining)`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 shadow-sm transition hover:bg-sky-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <UndoIcon />
        <span>Undo ({session.undosRemaining})</span>
      </button>
    ) : null,

    humanProfile: (
      <div className="flex min-w-0 items-center justify-between w-full gap-2">
        <div className="flex min-w-0 flex-col items-start">
          <span
            className={`truncate max-w-[140px] text-[11px] sm:text-xs font-semibold tracking-wide uppercase ${
              style === 'focus' ? 'text-neutral-400' : 'text-sky-400'
            }`}
          >
            {playerDisplayName}
          </span>
          <span
            className={`text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight ${
              style === 'focus' ? 'text-neutral-300' : 'text-sky-400'
            }`}
          >
            {humanBoard.score}
          </span>
          {turnUnderline(isHumanTurn, 'sky')}
        </div>
        {undoEnabled && (
          <button
            type="button"
            onClick={triggerUndo}
            disabled={!session.canUndo}
            data-testid="undo-button"
            aria-label={`Undo last move (${session.undosRemaining} remaining)`}
            title={`Undo last move (${session.undosRemaining} remaining)`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-950/40 px-2.5 py-1.5 text-xs font-medium text-sky-200 shadow-sm transition hover:bg-sky-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UndoIcon />
            <span>Undo ({session.undosRemaining})</span>
          </button>
        )}
        {renderHumanAvatar()}
      </div>
    ),

    opponentProfile: (
      <>
        <div className="flex min-w-0 flex-col items-start">
          <span
            className={`text-[11px] sm:text-xs font-semibold tracking-wide uppercase ${
              style === 'focus' ? 'text-neutral-400' : 'text-rose-400'
            }`}
          >
            {opponentLabel}
          </span>
          <span
            className={`text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight ${
              style === 'focus' ? 'text-neutral-300' : 'text-rose-400'
            }`}
          >
            {opponentBoard.score}
          </span>
          {turnUnderline(isOpponentTurn, 'rose')}
        </div>
        {renderOpponentAvatar()}
      </>
    ),

    youBoard: (
      <PlayerBoard
        board={humanBoard}
        label={playerDisplayName}
        active={isHumanTurn}
        interactive
        session={session}
        seat={humanSeat}
        variant={isStacked ? 'stacked' : 'panel'}
      />
    ),

    opponentBoard: (
      <PlayerBoard
        board={opponentBoard}
        label={opponentLabel}
        active={isOpponentTurn}
        interactive={false}
        session={session}
        seat={opponentSeat}
        variant={isStacked ? 'stacked' : 'panel'}
        badgeOverlay={
          style === 'classic' && !isStacked ? (
            <div
              className="absolute inset-0 flex items-center justify-end pointer-events-none select-none z-0 overflow-hidden pr-1"
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
    ),

    center: <DisplayArea session={session} title={title} />,

    actionCard: (
      <div className="flex min-w-0 flex-col leading-snug">
        <h3 className="text-xs font-bold text-sky-300">
          {isOpponentTurn
            ? `${opponentLabel}'s turn`
            : session.selection
              ? 'Place Tiles'
              : 'Your turn'}
        </h3>
        <p className="text-[11px] text-neutral-400">
          {isOpponentTurn
            ? `${opponentLabel} is thinking…`
            : session.selection
              ? 'Choose a staging row on your board or the floor line.'
              : 'Pick a tile from a factory or from the center.'}
        </p>
      </div>
    ),
  };

  return (
    <div ref={root} className="azul-main-layout relative w-full max-w-full">
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

      {isStacked ? <StackedLayout {...slots} /> : <WideLayout {...slots} />}
    </div>
  );
}
