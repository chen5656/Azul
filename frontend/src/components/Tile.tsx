import type { Color } from "../types/game";

const FILL: Record<Color, string> = {
  blue: "bg-tile-blue",
  yellow: "bg-tile-yellow",
  red: "bg-tile-red",
  black: "bg-tile-black",
  white: "bg-tile-white",
};

export function Tile({
  color,
  empty = false,
  size = "md",
  selected = false,
}: {
  color?: Color;
  empty?: boolean;
  size?: "sm" | "md";
  selected?: boolean;
}) {
  const box = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  const ring = selected ? "ring-2 ring-offset-1 ring-offset-neutral-900 ring-sky-300" : "";
  if (empty || !color) {
    return <div className={`${box} rounded border border-dashed border-neutral-700`} />;
  }
  return <div className={`${box} rounded border border-black/40 ${FILL[color]} ${ring}`} />;
}

export function FirstToken({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "w-5 h-5 text-[10px]" : "w-7 h-7 text-xs";
  return (
    <div
      className={`${box} rounded border border-sky-300 text-sky-200 grid place-items-center font-bold`}
      title="先手标记"
    >
      1
    </div>
  );
}
