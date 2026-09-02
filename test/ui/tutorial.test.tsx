/**
 * The tutorial's two guarantees: the script is playable against the real engine,
 * and the board refuses every move except the one being taught.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Action, QuadroGame } from '../../src/engine';
import { GreedyAgent } from '../../src/ai';
import { Tutorial } from '../../src/routes/Tutorial';
import { RouterProvider } from '../../src/router';
import {
  MOVE_STEPS,
  STEPS,
  TUTORIAL_FIRST_PLAYER,
  TUTORIAL_HUMAN_SEAT,
  TUTORIAL_OPPONENT_SEED,
  TUTORIAL_SEED,
} from '../../src/tutorial/script';

afterEach(cleanup);

describe('the lesson script', () => {
  it('is legal from start to finish against the seeded deal', () => {
    const game = new QuadroGame(TUTORIAL_SEED, TUTORIAL_FIRST_PLAYER);
    const opponent = new GreedyAgent(TUTORIAL_OPPONENT_SEED);

    for (const step of MOVE_STEPS) {
      expect(game.isOver()).toBe(false);
      expect(game.state.current).toBe(TUTORIAL_HUMAN_SEAT);
      const action = new Action(step.source, step.color, step.dest);
      expect(
        game.legalActions().some((a) => a.equals(action)),
        `step "${step.title}" plays ${action.describe()}, which is not legal there`,
      ).toBe(true);
      game.step(action);
      while (!game.isOver() && game.state.current !== TUTORIAL_HUMAN_SEAT) {
        game.step(opponent.choose(game.state, game.state.current));
      }
    }

    // The lesson's closing text names these numbers, so they are part of the
    // contract: the round settles 1–3 and nothing is left to draft in round 1.
    expect(game.state.round_num).toBe(2);
    expect(game.state.players.map((p) => p.score)).toEqual([1, 3]);
  });

  it('never asks for a move the interface cannot express', () => {
    for (const step of MOVE_STEPS) {
      expect(step.source).toBeGreaterThanOrEqual(0);
      expect(step.source).toBeLessThanOrEqual(5);
      expect(step.dest).toBeGreaterThanOrEqual(0);
      expect(step.dest).toBeLessThanOrEqual(5);
      expect(step.pick.length).toBeGreaterThan(0);
      expect(step.place.length).toBeGreaterThan(0);
      expect(step.after.length).toBeGreaterThan(0);
    }
  });
});

describe('the tutorial page', () => {
  /** The single enabled button whose name matches; fails loudly if not unique. */
  const onlyEnabled = (name: RegExp): HTMLElement => {
    const hits = screen
      .getAllByRole('button', { name })
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(hits, `expected exactly one enabled ${name} button`).toHaveLength(1);
    return hits[0];
  };

  const show = () =>
    render(
      <RouterProvider>
        <Tutorial />
      </RouterProvider>,
    );

  it('opens on step 1 with Next enabled and the board inert', () => {
    show();
    expect(screen.getByText(`Step 1 of ${STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    // Nothing on a talk step is playable, so every tile group is disabled.
    const takes = screen.getAllByRole('button', { name: /^Take / });
    expect(takes.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('enables only the taught move, and blocks Next until it is played', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const step = MOVE_STEPS[0];
    expect(screen.getByText(step.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    // Exactly one group is takeable: three reds out of factory 2.
    const take = onlyEnabled(/^Take /);
    expect(take).toHaveAccessibleName('Take 3 red from Factory 2');
    await user.click(take);

    // And exactly one destination: row 3.
    const row = onlyEnabled(/^Staging row/);
    expect(row).toHaveAccessibleName(/^Staging row 3/);
    await user.click(row);

    // The opponent answers on a timer, and only then may the learner move on.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(),
      { timeout: 4000 },
    );
    expect(screen.getByText(/Row 3 is full/)).toBeInTheDocument();
  });

  it('walks the whole lesson and lands on the play links', async () => {
    const user = userEvent.setup();
    show();

    for (const step of STEPS) {
      if (step.kind === 'move') {
        // The gating is the point: at every step exactly one group and then
        // exactly one destination is live, so the walkthrough never needs to
        // know which one — it just clicks whatever is enabled.
        await user.click(onlyEnabled(/^Take /));
        await user.click(onlyEnabled(/^(Staging row|Penalty row)/));
        await waitFor(
          () => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(),
          { timeout: 4000 },
        );
      }
      if (step !== STEPS[STEPS.length - 1]) {
        await user.click(screen.getByRole('button', { name: 'Next' }));
      }
    }

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play Practice' })).toHaveAttribute(
      'href',
      '/practice',
    );
  });
});
