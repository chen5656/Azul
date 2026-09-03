/**
 * The header's ⚙ settings menu.
 *
 * Style, scale, and opponent AI level live behind this button.
 */

import { useEffect, useRef, useState } from 'react';
import { LEVEL_LABELS, type AgentLevel } from '../ai';
import { DAILY_LEVELS, dailyHrefFor, isRankedLevel, resolveDailyLevel } from '../daily/levels';
import { practiceHrefFor, resolvePracticeLevel } from '../practice/levels';
import { DisplayScaleControl } from './DisplayScaleControl';
import { GameStyleControl } from './GameStyleControl';
import { useRouter } from '../router';

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { route, search, navigate } = useRouter();
  // The opponent lives in `?ai=` on both game routes, so anything that can
  // navigate can change it — here and the board's own opponent chip.
  const onDaily = route === '/daily';
  const onPractice = route === '/practice';
  const showOpponent = onDaily || onPractice;
  const currentLevel = onDaily ? resolveDailyLevel(search) : resolvePracticeLevel(search);
  const hrefForLevel = onDaily ? dailyHrefFor : practiceHrefFor;
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-8 w-8 items-center justify-center rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 ${
          open ? 'bg-neutral-800 text-neutral-100' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 6.01a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.089.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692a1.875 1.875 0 0 0 .433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
          />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 z-[60] mt-2 w-56 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl"
          >
          {showOpponent && (
            <div className="mb-3 border-b border-neutral-800 pb-3">
              <label
                htmlFor="settings-opponent"
                className="mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
              >
                Opponent
              </label>
              <select
                id="settings-opponent"
                value={currentLevel}
                onChange={(e) => {
                  navigate(hrefForLevel(e.target.value as AgentLevel, search));
                  setOpen(false);
                }}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                {DAILY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                    {onDaily && isRankedLevel(level) ? ' — Ranked' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <GameStyleControl />
            <DisplayScaleControl />
          </div>
        </div>
        </>
      )}
    </div>
  );
}
