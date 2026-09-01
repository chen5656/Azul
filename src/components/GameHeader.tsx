import { COLOR_NAMES, NUM_COLORS } from '../engine';
import type { Session } from '../game/useGameSession';
import { HumanAvatar, RobotAvatar } from './RobotAvatar';

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
        <HumanAvatar />
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
        <RobotAvatar level={opponentLabel} />
      </div>
    </header>
  );
}

