import { COLOR_INITIALS, COLOR_NAMES, FIRST_TOKEN } from '../engine';

const FILL = [
  'bg-tile-blue text-white shadow-sm border-blue-400/40',
  'bg-tile-yellow text-neutral-900 shadow-sm border-amber-300/40',
  'bg-tile-red text-white shadow-sm border-rose-400/40',
  'bg-tile-black text-neutral-200 shadow-sm border-neutral-600/40',
  'bg-tile-white text-neutral-900 shadow-sm border-slate-300/40',
];

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
}: {
  color?: number;
  empty?: boolean;
  size?: keyof typeof SIZES;
  selected?: boolean;
}) {
  if (empty || color === undefined || color < 0) {
    return (
      <div
        className={`${SIZES[size]} grid place-items-center rounded border border-neutral-700/50 bg-neutral-900/30 shadow-inner`}
        aria-hidden="true"
      >
        <SnowflakePattern />
      </div>
    );
  }
  const ring = selected ? 'ring-2 ring-offset-1 ring-offset-neutral-900 ring-sky-300 shadow-md shadow-sky-400/40' : '';
  return (
    <div
      className={`${SIZES[size]} ${FILL[color]} ${ring} grid place-items-center rounded border font-bold transition-transform`}
      title={COLOR_NAMES[color]}
    >
      {COLOR_INITIALS[color]}
    </div>
  );
}

/** The first-player token: a marker, not a tile. */
export function FirstToken({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <div
      className={`${SIZES[size]} grid place-items-center rounded-full border-2 border-sky-400 bg-sky-950/60 font-bold text-sky-200 shadow-sm`}
      title="First-player token"
    >
      1
    </div>
  );
}

/** Renders whatever sits in a penalty-row slot: a tile, the token, or nothing. */
export function PenaltySlot({ tile, size = 'sm' }: { tile?: number; size?: keyof typeof SIZES }) {
  if (tile === undefined) return <Tile empty size={size} />;
  if (tile === FIRST_TOKEN) return <FirstToken size={size} />;
  return <Tile color={tile} size={size} />;
}
