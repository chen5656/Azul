import { useEffect, useState } from 'react';
import { storage } from '../storage';

export const DISPLAY_SCALES = [
  { value: '125', label: '125%' },
  { value: '110', label: '110%' },
  { value: '100', label: '100%' },
  { value: '90', label: '90%' },
  { value: '85', label: '85%' },
  { value: '80', label: '80%' },
  { value: '75', label: '75%' },
] as const;

export function DisplayScaleControl() {
  const [scale, setScale] = useState<string>(() => {
    const saved = storage.displayScale();
    if (saved && DISPLAY_SCALES.some((s) => s.value === saved)) {
      return saved;
    }
    return '100';
  });

  useEffect(() => {
    const root = document.getElementById('root');
    const numericScale = Number(scale) / 100;
    if (root) {
      if (scale === '100') {
        root.style.removeProperty('zoom');
        root.style.removeProperty('transform');
        root.style.removeProperty('transformOrigin');
        root.style.removeProperty('width');
      } else {
        // Use CSS zoom where supported (Chrome, Safari, Edge)
        // Fallback gracefully for environments supporting transform
        if ('zoom' in root.style) {
          (root.style as unknown as { zoom: string }).zoom = String(numericScale);
        } else {
          root.style.transform = `scale(${numericScale})`;
          root.style.transformOrigin = 'top center';
          root.style.width = `${100 / numericScale}%`;
        }
      }
    }
  }, [scale]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScale = e.target.value;
    setScale(newScale);
    storage.setDisplayScale(newScale);
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
      <label htmlFor="display-scale-select" className="sr-only sm:not-sr-only text-neutral-400 font-medium">
        Display
      </label>
      <div className="relative">
        <select
          id="display-scale-select"
          aria-label="Display Scale"
          value={scale}
          onChange={handleChange}
          className="appearance-none rounded border border-neutral-700 bg-neutral-900/90 py-1 pl-2 pr-6 text-xs text-neutral-200 hover:border-neutral-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer font-medium"
        >
          {DISPLAY_SCALES.map(({ value, label }) => (
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
