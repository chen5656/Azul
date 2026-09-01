import { useGameStyle } from '../context/GameStyleContext';
import { COLOR_INITIALS, COLOR_NAMES, FIRST_TOKEN } from '../engine';

const FILL_NORMAL = [
  'bg-tile-blue text-white shadow-sm border-blue-400/40',
  'bg-tile-yellow text-neutral-900 shadow-sm border-amber-300/40',
  'bg-tile-red text-white shadow-sm border-rose-400/40',
  'bg-tile-black text-neutral-200 shadow-sm border-neutral-600/40',
  'bg-tile-white text-neutral-900 shadow-sm border-slate-300/40',
];

export const FILL_FOCUS = [
  'bg-blue-950/40 text-blue-300 border-blue-600/40 font-black',
  'bg-amber-950/40 text-amber-300 border-amber-600/40 font-black',
  'bg-rose-950/40 text-rose-300 border-rose-600/40 font-black',
  'bg-neutral-950 text-neutral-400 border-neutral-700/60 font-black',
  'bg-slate-700/40 text-slate-100 border-slate-300/50 font-black',
];

/**
 * The wall's empty cells carry a whisper of the colour that belongs there, so
 * you can read where a tile can still go without counting letters. Focus style
 * drops it along with the rest of the colour cues.
 */
export const WALL_TINT = [
  'border-blue-500/25 bg-blue-500/[0.07] text-blue-300/50',
  'border-amber-400/25 bg-amber-400/[0.07] text-amber-200/50',
  'border-rose-500/25 bg-rose-500/[0.07] text-rose-300/50',
  'border-neutral-500/30 bg-neutral-400/[0.07] text-neutral-300/50',
  'border-slate-300/25 bg-slate-200/[0.07] text-slate-200/55',
];

export const WALL_PLAIN = 'border-neutral-800/80 bg-neutral-900/20 text-neutral-600';

const SIZES = {
  /** Fluid: follows the width of the enclosing `.azul-board` (see index.css). */
  sm: 'azul-tile',
  md: 'azul-tile-lg',
};

function SnowflakePattern() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-30 stroke-current text-neutral-400" fill="none" strokeWidth="1.5">
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * One tile. The color initial is always drawn on the tile, so the five colors
 * stay distinguishable without color vision (NFR-006, AC-034).
 */
export function Tile({
  color,
  empty = false,
  size = 'md',
  selected = false,
  animId,
}: {
  color?: number;
  empty?: boolean;
  size?: keyof typeof SIZES;
  selected?: boolean;
  animId?: string;
}) {
  const { style } = useGameStyle();

  if (empty || color === undefined || color < 0) {
    return (
      <div
        data-anim-id={animId}
        className={`${SIZES[size]} grid place-items-center rounded border border-neutral-700/50 bg-neutral-900/30 shadow-inner`}
        aria-hidden="true"
      >
        <SnowflakePattern />
      </div>
    );
  }
  const fillClass = style === 'focus' ? FILL_FOCUS[color] : FILL_NORMAL[color];
  const ring = selected ? 'ring-2 ring-offset-1 ring-offset-neutral-900 ring-sky-300 shadow-md shadow-sky-400/40' : '';
  return (
    <div
      data-anim-id={animId}
      className={`${SIZES[size]} ${fillClass} ${ring} grid place-items-center rounded border font-bold transition-transform`}
      title={COLOR_NAMES[color]}
    >
      {COLOR_INITIALS[color]}
    </div>
  );
}

/** The first-player token: a marker, not a tile. */
export function FirstToken({ size = 'md', animId }: { size?: keyof typeof SIZES; animId?: string }) {
  return (
    <div
      data-anim-id={animId}
      className={`${SIZES[size]} grid place-items-center rounded-full border-2 border-sky-400 bg-sky-950/60 font-bold text-sky-200 shadow-sm`}
      title="First-player token"
    >
      1
    </div>
  );
}

/** Renders whatever sits in a penalty-row slot: a tile, the token, or nothing. */
export function PenaltySlot({ tile, size = 'sm', animId }: { tile?: number; size?: keyof typeof SIZES; animId?: string }) {
  if (tile === undefined) return <Tile empty size={size} animId={animId} />;
  if (tile === FIRST_TOKEN) return <FirstToken size={size} animId={animId} />;
  return <Tile color={tile} size={size} animId={animId} />;
}
