import { COLOR_NAMES, NUM_COLORS } from '../engine';
import type { Session } from '../game/useGameSession';

export function FoxAvatar() {
  return (
    <div className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-amber-100/90 shadow-md ring-2 ring-amber-400/40">
      <svg viewBox="0 0 36 36" className="h-7 w-7 sm:h-8 sm:w-8" fill="none">
        {/* Fox ears */}
        <polygon points="6,16 11,4 16,13" fill="#E65100" />
        <polygon points="8,15 11,7 14,13" fill="#FFE0B2" />
        <polygon points="30,16 25,4 20,13" fill="#E65100" />
        <polygon points="28,15 25,7 22,13" fill="#FFE0B2" />
        {/* Fox head */}
        <ellipse cx="18" cy="20" rx="13" ry="11" fill="#FB8C00" />
        {/* Cheeks / muzzle */}
        <path d="M 6 22 C 6 29 18 31 18 31 C 18 31 30 29 30 22 C 27 21 23 21 18 24 C 13 21 9 21 6 22 Z" fill="#FFF3E0" />
        {/* Eyes */}
        <circle cx="12" cy="18" r="2.2" fill="#263238" />
        <circle cx="24" cy="18" r="2.2" fill="#263238" />
        <circle cx="12.8" cy="17.3" r="0.8" fill="#FFFFFF" />
        <circle cx="24.8" cy="17.3" r="0.8" fill="#FFFFFF" />
        {/* Nose */}
        <polygon points="18,25 16,23 20,23" fill="#212121" />
      </svg>
    </div>
  );
}

export function RaccoonAvatar() {
  return (
    <div className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/90 shadow-md ring-2 ring-slate-400/40">
      <svg viewBox="0 0 36 36" className="h-7 w-7 sm:h-8 sm:w-8" fill="none">
        {/* Ears */}
        <polygon points="6,15 9,4 15,12" fill="#546E7A" />
        <polygon points="7,14 10,7 13,12" fill="#ECEFF1" />
        <polygon points="30,15 27,4 21,12" fill="#546E7A" />
        <polygon points="29,14 26,7 23,12" fill="#ECEFF1" />
        {/* Head */}
        <ellipse cx="18" cy="20" rx="13" ry="11" fill="#78909C" />
        {/* Mask */}
        <path d="M 7 19 Q 12 15 18 20 Q 24 15 29 19 Q 29 23 25 24 Q 18 21 11 24 Q 7 23 7 19 Z" fill="#37474F" />
        {/* Cheeks / Muzzle */}
        <ellipse cx="18" cy="25" rx="6" ry="4.5" fill="#ECEFF1" />
        {/* Eyes */}
        <circle cx="12" cy="19" r="2" fill="#FFFFFF" />
        <circle cx="24" cy="19" r="2" fill="#FFFFFF" />
        <circle cx="12" cy="19" r="1.3" fill="#212121" />
        <circle cx="24" cy="19" r="1.3" fill="#212121" />
        <circle cx="12.5" cy="18.5" r="0.5" fill="#FFFFFF" />
        <circle cx="24.5" cy="18.5" r="0.5" fill="#FFFFFF" />
        {/* Nose */}
        <polygon points="18,24.5 16.5,23 19.5,23" fill="#212121" />
      </svg>
    </div>
  );
}

export const COLOR_DOTS = [
  'bg-tile-blue ring-sky-300/60',
  'bg-tile-yellow ring-amber-300/60',
  'bg-tile-red ring-rose-300/60',
  'bg-tile-black ring-neutral-400/60',
  'bg-tile-white ring-slate-300/60',
];

export function GameHeader({
  session,
  humanLabel = 'You',
  opponentLabel = 'Opponent',
}: {
  session: Session;
  humanLabel?: string;
  opponentLabel?: string;
}) {
  const { game, humanSeat, status } = session;
  const humanScore = game.state.players[humanSeat]?.score ?? 0;
  const opponentSeat = 1 - humanSeat;
  const opponentScore = game.state.players[opponentSeat]?.score ?? 0;
  const currentRound = game.state.round_num;
  const isHumanTurn = status === 'idle' || status === 'your-turn';
  const isOpponentTurn = status === 'ai-thinking';

  return (
    <header className="flex w-full items-center justify-between px-2 sm:px-4 py-1">
      {/* Left: You Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <FoxAvatar />
        <div className="flex flex-col">
          <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-sky-400 uppercase">
            {humanLabel}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight text-sky-400">
              {humanScore}
            </span>
          </div>
          {/* Active Turn Indicator Underline */}
          <div
            className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
              isHumanTurn ? 'bg-sky-500 shadow-sm shadow-sky-400/50' : 'bg-transparent'
            }`}
          />
        </div>
      </div>

      {/* Center: Round Indicator & Progress Dots & Color Dots */}
      <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <div className="rounded-full border border-sky-400/20 bg-sky-950/40 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-sky-300 backdrop-blur-sm shadow-sm">
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
        </div>

        {/* Color Filter / Palette Indicator Pill */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 rounded-full border border-neutral-700/40 bg-neutral-900/50 px-2.5 py-0.5 shadow-inner backdrop-blur-sm">
          {Array.from({ length: NUM_COLORS }, (_, c) => (
            <div
              key={c}
              className={`h-2.5 w-2.5 rounded-full shadow-sm ring-1 ${COLOR_DOTS[c]}`}
              title={COLOR_NAMES[c]}
            />
          ))}
        </div>
      </div>

      {/* Right: Opponent Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <div className="flex flex-col items-end">
          <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-rose-400 uppercase">
            {opponentLabel}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight text-rose-400">
              {opponentScore}
            </span>
          </div>
          {/* Active Turn Indicator Underline */}
          <div
            className={`h-0.5 sm:h-1 w-7 sm:w-8 rounded-full transition-all duration-300 ${
              isOpponentTurn ? 'bg-rose-500 shadow-sm shadow-rose-400/50' : 'bg-transparent'
            }`}
          />
        </div>
        <RaccoonAvatar />
      </div>
    </header>
  );
}
