import { GAME_STYLES, useGameStyle, type GameStyle } from '../context/GameStyleContext';

export function GameStyleControl() {
  const { style, setStyle } = useGameStyle();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStyle(e.target.value as GameStyle);
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
      <label htmlFor="game-style-select" className="sr-only sm:not-sr-only text-neutral-400 font-medium">
        Style
      </label>
      <div className="relative">
        <select
          id="game-style-select"
          aria-label="Game Style"
          value={style}
          onChange={handleChange}
          className="appearance-none rounded border border-neutral-700 bg-neutral-900/90 py-1 pl-2 pr-6 text-xs text-neutral-200 hover:border-neutral-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer font-medium"
        >
          {GAME_STYLES.map(({ value, label }) => (
            <option key={value} value={value} className="bg-neutral-900 text-neutral-200">
              {label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-neutral-400">
          <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
