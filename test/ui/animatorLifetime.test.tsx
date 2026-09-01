/**
 * The animator must outlive renders.
 *
 * `useGameSession` hands back a fresh object on every render, so a `useEffect`
 * keyed on the session tore the animator down and rebuilt it constantly — and
 * teardown calls `clear()`, which removes the tiles that are mid-flight.
 * Selecting a tile, the post-move state bump and the timer tick all render
 * while an animation is running, so nearly every flight was destroyed within a
 * frame or two of starting. Animations looked absent, with the odd flicker.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const created = vi.fn();

vi.mock('../../src/components/animator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/animator')>();
  return {
    ...actual,
    createAnimator: (...args: Parameters<typeof actual.createAnimator>) => {
      created();
      return actual.createAnimator(...args);
    },
  };
});

const { Practice } = await import('../../src/routes/Practice');

afterEach(() => {
  cleanup();
  created.mockClear();
  vi.restoreAllMocks();
});

describe('animator lifetime', () => {
  it('builds one animator for the game and keeps it across renders and a move', async () => {
    const user = userEvent.setup();
    render(<Practice />);
    await user.click(screen.getByRole('button', { name: 'Easy' }));
    await user.click(screen.getByRole('button', { name: 'Start playing' }));

    await waitFor(() => expect(created).toHaveBeenCalled());
    // React 18 StrictMode-free render: one mount, one animator.
    const afterMount = created.mock.calls.length;
    expect(afterMount).toBe(1);

    // A move renders several times over: selection cleared, state bumped,
    // opponent turn resolved. None of that may replace the animator.
    await user.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    const myBoard = screen.getByRole('region', { name: 'You' });
    const target = within(myBoard)
      .getAllByRole('button', { name: /Staging row/ })
      .find((row) => !row.hasAttribute('disabled'))!;
    await user.click(target);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Your turn/i),
    );

    expect(created).toHaveBeenCalledTimes(afterMount);
  });
});
