/**
 * Learn to play: a scripted round on the real board.
 *
 * The board here is the same `Board` the Daily and Practice render, driven by a
 * `Session` the tutorial synthesizes — so what the learner practises is the
 * interface they will actually use. The coach panel sits above it on narrow
 * screens and beside it on wide ones.
 *
 * Nothing here touches the network or storage: the lesson is a fixed seed and a
 * synchronous opponent (D-019, FR-014).
 */

import { Board } from '../components/Board';
import { Link } from '../router';
import { OPPONENT_LABEL } from '../tutorial/script';
import { useTutorial } from '../tutorial/useTutorial';

export function Tutorial() {
  const { session, step, stepIndex, stepCount, phase, body, canAdvance, next, restart, done } =
    useTutorial();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Learn to play</h1>
          <p className="text-xs text-neutral-500">
            One scripted round · nothing here is timed or recorded
          </p>
        </div>
        <button
          type="button"
          onClick={restart}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Start over
        </button>
      </header>

      <section
        aria-label="Lesson"
        className="rounded-xl border border-sky-800 bg-sky-950/30 p-4"
        // The panel is the tutorial's running commentary: announce each new step
        // rather than leaving screen-reader users to hunt for what changed.
        aria-live="polite"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-sky-100">{step.title}</h2>
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">
            Step {stepIndex + 1} of {stepCount}
          </span>
        </div>

        <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-300">
          {body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {done ? (
            <>
              <Link
                to="/practice"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
              >
                Play Practice
              </Link>
              <Link
                to="/daily"
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
              >
                Today's Daily
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40"
            >
              Next
            </button>
          )}
          {!canAdvance && (
            <span className="text-xs text-neutral-500">
              {phase === 'replying'
                ? `${OPPONENT_LABEL} is answering…`
                : phase === 'pick'
                  ? 'Take the highlighted tiles to continue.'
                  : 'Place them on the highlighted row to continue.'}
            </span>
          )}
        </div>
      </section>

      <Board session={session} humanLabel="You" opponentLabel={OPPONENT_LABEL} />
    </div>
  );
}
