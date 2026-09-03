import type { AgentLevel } from '../ai';

export const LEVEL_BADGE_URLS: Record<AgentLevel, string> = {
  extreme: '/badges/1_extreme_red.png',
  master: '/badges/2_master_purple.png',
  expert: '/badges/3_expert_blue.png',
  hard: '/badges/4_hard_orange.png',
  medium: '/badges/5_medium_green.png',
  easy: '/badges/6_easy_cyan.png',
};


/**
 * Chip colors that match each badge's own color, so the difficulty control
 * reads as the agent you are facing rather than as generic UI.
 */
export const LEVEL_CHIP: Record<AgentLevel, string> = {
  extreme: 'border-red-400/60 bg-red-500/15 text-red-200 hover:bg-red-500/30',
  master: 'border-purple-400/60 bg-purple-500/15 text-purple-200 hover:bg-purple-500/30',
  expert: 'border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/30',
  hard: 'border-orange-400/60 bg-orange-500/15 text-orange-200 hover:bg-orange-500/30',
  medium: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/30',
  easy: 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/30',
};

export function levelChip(level?: AgentLevel | string): string {
  const norm = (level?.toLowerCase() ?? '') as AgentLevel;
  return LEVEL_CHIP[norm] ?? 'border-rose-400/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/25';
}

export function getBadgeSrc(level?: AgentLevel | string): string {
  const normLevel = (level?.toLowerCase() ?? 'extreme') as AgentLevel;
  return LEVEL_BADGE_URLS[normLevel] ?? LEVEL_BADGE_URLS.extreme;
}

/**
 * Robot Badge Avatar for AI Opponents.
 * Displays the dedicated robot badge for the current difficulty level.
 */
export function RobotAvatar({
  level,
  className = 'h-9 w-9 sm:h-10 sm:w-10',
}: {
  level?: AgentLevel | string;
  className?: string;
}) {
  const badgeSrc = getBadgeSrc(level);

  return (
    <div className={`relative flex shrink-0 items-center justify-center ${className}`}>

      <img
        src={badgeSrc}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-contain drop-shadow-md transition-transform hover:scale-105"
        loading="eager"
      />
    </div>
  );
}

export function HumanAvatar({
  color = 'sky',
  className = 'h-9 w-9 sm:h-10 sm:w-10',
}: {
  color?: 'sky' | 'rose' | 'amber' | 'emerald' | 'purple' | 'neutral' | string;
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    sky: 'from-sky-400 to-sky-600 ring-sky-300/40',
    rose: 'from-rose-400 to-rose-600 ring-rose-300/40',
    amber: 'from-amber-400 to-amber-600 ring-amber-300/40',
    emerald: 'from-emerald-400 to-emerald-600 ring-emerald-300/40',
    purple: 'from-purple-400 to-purple-600 ring-purple-300/40',
    neutral: 'from-neutral-500 to-neutral-700 ring-neutral-400/40',
  };

  const ringAndGradient = colorMap[color] ?? colorMap.sky;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b ${ringAndGradient} shadow-md ring-2 p-1.5 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-full w-full fill-white" fill="none">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  );
}
