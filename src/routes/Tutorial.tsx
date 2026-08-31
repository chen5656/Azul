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
import { TutorialPopover } from '../components/TutorialPopover';
import { OPPONENT_LABEL } from '../tutorial/script';
import { useTutorial } from '../tutorial/useTutorial';

export function Tutorial() {
  const {
    session,
    step,
    stepIndex,
    stepCount,
    phase,
    body,
    canAdvance,
    next,
    restart,
    done,
  } = useTutorial();

  return (
    <div className="relative flex flex-col gap-3 sm:gap-4 w-full">
      <TutorialPopover
        step={step}
        stepIndex={stepIndex}
        stepCount={stepCount}
        phase={phase}
        body={body}
        canAdvance={canAdvance}
        next={next}
        restart={restart}
        done={done}
        spotlight={session.spotlight}
      />

      <Board
        session={session}
        humanLabel="You"
        opponentLabel={OPPONENT_LABEL}
      />
    </div>
  );
}
