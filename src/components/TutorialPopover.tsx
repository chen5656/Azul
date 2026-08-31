import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Spotlight, Step } from '../tutorial/script';
import { OPPONENT_LABEL } from '../tutorial/script';
import type { Phase } from '../tutorial/useTutorial';
import { Link } from '../router';

interface TutorialPopoverProps {
  step: Step;
  stepIndex: number;
  stepCount: number;
  phase: Phase;
  body: string[];
  canAdvance: boolean;
  next: () => void;
  restart: () => void;
  done: boolean;
  spotlight?: Spotlight;
}

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export function TutorialPopover({
  step,
  stepIndex,
  stepCount,
  phase,
  body,
  canAdvance,
  next,
  restart,
  done,
  spotlight,
}: TutorialPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number; placement: Placement } | null>(null);

  // Compute position relative to spotlighted DOM element
  useLayoutEffect(() => {
    let targetSelector: string | null = null;
    if (spotlight) {
      if (spotlight.kind === 'source') {
        targetSelector = `[data-tutorial-target="source-${spotlight.index}"]`;
      } else if (spotlight.kind === 'row') {
        targetSelector = `[data-tutorial-target="row-${spotlight.index}"]`;
      } else if (spotlight.kind === 'floor') {
        targetSelector = `[data-tutorial-target="floor"]`;
      } else if (spotlight.kind === 'wall') {
        targetSelector = `[data-tutorial-target="wall"]`;
      }
    }

    const updatePosition = () => {
      const popoverEl = popoverRef.current;
      if (!popoverEl) return;

      const targetEl = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : null;

      if (!targetEl) {
        setCoords({ x: 0, y: 0, placement: 'center' });
        return;
      }

      const targetRect = targetEl.getBoundingClientRect();
      const popoverRect = popoverEl.getBoundingClientRect();
      const margin = 14;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Try placements in preferred order: right -> left -> top -> bottom
      let chosenPlacement: Placement = 'right';
      let x = targetRect.right + margin;
      let y = targetRect.top + targetRect.height / 2 - popoverRect.height / 2;

      // Check if right overflows viewport
      if (x + popoverRect.width > vw - 16) {
        // Try left
        if (targetRect.left - popoverRect.width - margin > 16) {
          chosenPlacement = 'left';
          x = targetRect.left - popoverRect.width - margin;
          y = targetRect.top + targetRect.height / 2 - popoverRect.height / 2;
        } else if (targetRect.top - popoverRect.height - margin > 60) {
          // Try top
          chosenPlacement = 'top';
          x = targetRect.left + targetRect.width / 2 - popoverRect.width / 2;
          y = targetRect.top - popoverRect.height - margin;
        } else {
          // Bottom
          chosenPlacement = 'bottom';
          x = targetRect.left + targetRect.width / 2 - popoverRect.width / 2;
          y = targetRect.bottom + margin;
        }
      }

      // Constrain within viewport bounds
      x = Math.max(12, Math.min(x, vw - popoverRect.width - 12));
      y = Math.max(12, Math.min(y, vh - popoverRect.height - 12));

      setCoords({ x, y, placement: chosenPlacement });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [spotlight, stepIndex, phase, body]);

  const isCenter = coords?.placement === 'center' || !coords;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Lesson Coach"
      aria-live="polite"
      style={
        isCenter
          ? undefined
          : {
              position: 'fixed',
              left: `${coords.x}px`,
              top: `${coords.y}px`,
              zIndex: 50,
            }
      }
      className={`transition-all duration-200 ease-out ${
        isCenter
          ? 'relative w-full max-w-xl mx-auto my-2 rounded-2xl border border-sky-500/50 bg-neutral-900/95 p-4 sm:p-5 shadow-2xl backdrop-blur-md ring-1 ring-sky-400/30'
          : 'w-[calc(100vw-24px)] max-w-sm sm:max-w-md rounded-xl border border-sky-400/80 bg-neutral-900/95 p-3.5 sm:p-4 shadow-2xl backdrop-blur-md ring-2 ring-sky-500/40 text-neutral-100'
      }`}
    >
      {/* Arrow Indicator when anchored next to a target */}
      {!isCenter && coords && (
        <div
          className={`absolute pointer-events-none w-3 h-3 bg-neutral-900 border-sky-400/80 transform rotate-45 ${
            coords.placement === 'right'
              ? '-left-1.5 top-1/2 -translate-y-1/2 border-l border-b'
              : coords.placement === 'left'
              ? '-right-1.5 top-1/2 -translate-y-1/2 border-r border-t'
              : coords.placement === 'top'
              ? '-bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b'
              : '-top-1.5 left-1/2 -translate-x-1/2 border-l border-t'
          }`}
        />
      )}

      {/* Header with Title and Step Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-sky-400 animate-ping" />
          <h2 className="font-semibold text-base sm:text-lg text-sky-200 tracking-tight">
            {step.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-md bg-sky-950/70 border border-sky-800/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-sky-300">
            Step {stepIndex + 1} of {stepCount}
          </span>
          <button
            type="button"
            onClick={restart}
            title="Start tutorial over"
            className="rounded border border-neutral-700/60 px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            Restart
          </button>
        </div>
      </div>

      {/* Coach Commentary */}
      <div className="mt-2.5 space-y-2 text-xs sm:text-sm leading-relaxed text-neutral-200">
        {body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {/* Actions & Live Instructions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-neutral-800">
        <div className="flex-1 min-w-0">
          {!canAdvance && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <svg className="w-3.5 h-3.5 shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="truncate">
                {phase === 'replying'
                  ? `${OPPONENT_LABEL} is answering…`
                  : phase === 'pick'
                  ? 'Click highlighted tiles to take.'
                  : 'Click highlighted row to place.'}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {done ? (
            <>
              <Link
                to="/practice"
                className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-sky-500 transition"
              >
                Play Practice
              </Link>
              <Link
                to="/daily"
                className="rounded-lg border border-neutral-700 px-3.5 py-1.5 text-xs sm:text-sm font-medium hover:bg-neutral-800 transition"
              >
                Today's Daily
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
