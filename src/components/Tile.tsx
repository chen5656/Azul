import { COLOR_INITIALS, COLOR_NAMES, FIRST_TOKEN } from '../engine';

const FILL = [
  'bg-tile-blue text-white',
  'bg-tile-yellow text-neutral-900',
  'bg-tile-red text-white',
  'bg-tile-black text-neutral-200',
  'bg-tile-white text-neutral-900',
];

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
};

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
        className={`${SIZES[size]} rounded border border-dashed border-neutral-700`}
        aria-hidden="true"
      />
    );
  }
  const ring = selected ? 'ring-2 ring-offset-1 ring-offset-neutral-900 ring-sky-300' : '';
  return (
    <div
      className={`${SIZES[size]} ${FILL[color]} ${ring} grid place-items-center rounded border border-black/40 font-bold`}
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
      className={`${SIZES[size]} grid place-items-center rounded border border-sky-300 font-bold text-sky-200`}
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
