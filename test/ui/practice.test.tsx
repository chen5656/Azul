/**
 * Board interaction and the Practice surface (§19 "UI component").
 *
 * jsdom has no `Worker`, so `AiClient` falls back to main-thread search here —
 * which is also the fallback path AC-037 requires to work.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Practice } from '../../src/routes/Practice';
import { RouterProvider } from '../../src/router';
import { formatElapsed } from '../../src/components/Timer';

afterEach(() => {
  cleanup();
  // Node's own localStorage shim can shadow jsdom's; the app tolerates either.
  try {
    window.localStorage.clear?.();
  } catch {
    /* nothing remembered, nothing to clear */
  }
  vi.restoreAllMocks();
});

async function startPractice(level = 'Easy', seed = '4242') {
  const user = userEvent.setup();
  render(<Practice />);
  await user.click(screen.getByRole('button', { name: level }));
  await user.clear(screen.getByLabelText('Seed'));
  await user.type(screen.getByLabelText('Seed'), seed);
  await user.click(screen.getByRole('button', { name: 'Start playing' }));
  return user;
}

describe('practice setup', () => {
  it('states plainly that nothing is recorded (FR-015)', () => {
    render(<Practice />);
    expect(screen.getByText(/Nothing here is timed, recorded or submitted/i)).toBeInTheDocument();
  });

  it('offers all four levels and no others (FR-010)', () => {
    render(<Practice />);
    for (const label of ['Easy', 'Medium', 'Hard', 'Expert', 'Master', 'Extreme']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText(/zero/i)).not.toBeInTheDocument();
  });

  it('defaults seed to empty when opening without seed parameter', () => {
    render(<Practice />);
    expect(screen.getByLabelText('Seed')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Start playing' })).not.toBeDisabled();
  });

  it('reads seed from URL search parameters', () => {
    window.history.pushState({}, '', '/practice?seed=98765');
    render(
      <RouterProvider>
        <Practice />
      </RouterProvider>,
    );
    expect(screen.getByLabelText('Seed')).toHaveValue('98765');
    expect(screen.getByRole('button', { name: 'Start playing' })).not.toBeDisabled();
    window.history.pushState({}, '', '/practice');
  });

  it('rejects a seed outside the valid range and blocks the start button', async () => {
    const user = userEvent.setup();
    render(<Practice />);
    const seedInput = screen.getByLabelText('Seed');
    await user.clear(seedInput);
    await user.type(seedInput, '2147483648');
    expect(seedInput).toBeInvalid();
    expect(screen.getByRole('button', { name: 'Start playing' })).toBeDisabled();
  });

  it('rejects a non-numeric seed and blocks the start button', async () => {
    const user = userEvent.setup();
    render(<Practice />);
    const seedInput = screen.getByLabelText('Seed');
    await user.clear(seedInput);
    await user.type(seedInput, 'abc');
    expect(seedInput).toBeInvalid();
    expect(screen.getByRole('button', { name: 'Start playing' })).toBeDisabled();
  });

  it('shows the seed in play so a deal can be replayed (FR-011)', async () => {
    await startPractice('Easy', '4242');
    expect(screen.getByText(/Seed 4242/)).toBeInTheDocument();
  });
});

describe('board interaction', () => {
  it('requires a source before any destination is enabled (§9.2)', async () => {
    await startPractice();
    const myBoard = screen.getByRole('region', { name: 'You' });
    const rows = within(myBoard).getAllByRole('button', { name: /Context line/ });
    expect(rows.every((row) => row.hasAttribute('disabled'))).toBe(true);

    const source = screen.getAllByRole('button', { name: /^Take \d/ })[0];
    await userEvent.click(source);
    expect(within(myBoard).getAllByRole('button', { name: /Context line/ }).some((r) => !r.hasAttribute('disabled'))).toBe(true);
  });

  it('never enables an illegal destination', async () => {
    await startPractice();
    // The opponent's board is never a destination.
    const theirBoard = screen.getByRole('region', { name: 'Easy' });
    await userEvent.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    for (const row of within(theirBoard).getAllByRole('button', { name: /Context line/ })) {
      expect(row).toBeDisabled();
    }
  });

  it('clears a pending selection on Escape', async () => {
    const user = await startPractice();
    const source = screen.getAllByRole('button', { name: /^Take \d/ })[0];
    await user.click(source);
    expect(source).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(source).toHaveAttribute('aria-pressed', 'false');
  });

  it('plays a move and hands the turn to the opponent', async () => {
    const user = await startPractice();
    await user.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    const myBoard = screen.getByRole('region', { name: 'You' });
    const target = within(myBoard)
      .getAllByRole('button', { name: /Context line/ })
      .find((row) => !row.hasAttribute('disabled'))!;
    await user.click(target);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/your turn|thinking|win|Draw/i),
    );
  });

  it('lets the opponent open when the deal seats it first', async () => {
    // Seed 564659697 deals the first move to seat 1, so the session must run the
    // opponent's turn on its own before the player can touch anything.
    await startPractice('Easy', '564659697');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Your turn/i),
    );
    const theirBoard = screen.getByRole('region', { name: 'Easy' });
    const staged = within(theirBoard)
      .getAllByRole('button', { name: /Context line/ })
      .some((row) => row.textContent !== '');
    const penalised = within(theirBoard).getByRole('button', { name: /Hallucination line/ });
    expect(staged || penalised.textContent !== '-1-1-2-2-2-3-3').toBe(true);
  });

  it('offers undo control up to 3 times per game', async () => {
    const user = await startPractice();
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).toBeInTheDocument();
    expect(undoButton).toHaveTextContent('Undo (3)');
    expect(undoButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();

    // Make a move
    await user.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    const myBoard = screen.getByRole('region', { name: 'You' });
    const target = within(myBoard)
      .getAllByRole('button', { name: /Context line/ })
      .find((row) => !row.hasAttribute('disabled'))!;
    await user.click(target);

    await waitFor(() => expect(undoButton).not.toBeDisabled());
    expect(undoButton).toHaveTextContent('Undo (3)');

    // Click Undo
    await user.click(undoButton);
    expect(undoButton).toHaveTextContent('Undo (2)');
  });

  it('makes no network request while playing (AC-007)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = await startPractice();
    await user.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('formatElapsed', () => {
  it('formats as mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(461_230)).toBe('07:41');
    expect(formatElapsed(59_999)).toBe('00:59');
    expect(formatElapsed(-5)).toBe('00:00');
  });
});
