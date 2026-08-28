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

async function startPractice(level = 'Random', seed = '4242') {
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
    for (const label of ['Random', 'Greedy', 'Minimax', 'Monte Carlo']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText(/zero/i)).not.toBeInTheDocument();
  });

  it('rejects a non-numeric seed and blocks the start button', async () => {
    const user = userEvent.setup();
    render(<Practice />);
    await user.type(screen.getByLabelText('Seed'), 'abc');
    expect(screen.getByLabelText('Seed')).toBeInvalid();
    expect(screen.getByRole('button', { name: 'Start playing' })).toBeDisabled();
  });

  it('shows the seed in play so a deal can be replayed (FR-011)', async () => {
    await startPractice('Random', '4242');
    expect(screen.getByText(/Seed 4242/)).toBeInTheDocument();
  });
});

describe('board interaction', () => {
  it('requires a source before any destination is enabled (§9.2)', async () => {
    await startPractice();
    const myBoard = screen.getByRole('region', { name: 'You' });
    const rows = within(myBoard).getAllByRole('button', { name: /Staging row/ });
    expect(rows.every((row) => row.hasAttribute('disabled'))).toBe(true);

    const source = screen.getAllByRole('button', { name: /^Take \d/ })[0];
    await userEvent.click(source);
    expect(within(myBoard).getAllByRole('button', { name: /Staging row/ }).some((r) => !r.hasAttribute('disabled'))).toBe(true);
  });

  it('never enables an illegal destination', async () => {
    await startPractice();
    // The opponent's board is never a destination.
    const theirBoard = screen.getByRole('region', { name: 'Random' });
    await userEvent.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    for (const row of within(theirBoard).getAllByRole('button', { name: /Staging row/ })) {
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
      .getAllByRole('button', { name: /Staging row/ })
      .find((row) => !row.hasAttribute('disabled'))!;
    await user.click(target);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/your turn|thinking|win|Draw/i),
    );
  });

  it('lets the opponent open when the deal seats it first', async () => {
    // Seed 564659697 deals the first move to seat 1, so the session must run the
    // opponent's turn on its own before the player can touch anything.
    await startPractice('Random', '564659697');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Your turn/i),
    );
    const theirBoard = screen.getByRole('region', { name: 'Random' });
    const staged = within(theirBoard)
      .getAllByRole('button', { name: /Staging row/ })
      .some((row) => row.textContent !== '');
    const penalised = within(theirBoard).getByRole('button', { name: /Penalty row/ });
    expect(staged || penalised.textContent !== '-1-1-2-2-2-3-3').toBe(true);
  });

  it('offers no undo control (AC-008)', async () => {
    await startPractice();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
  });

  it('makes no network request while playing (AC-007)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = await startPractice();
    await user.click(screen.getAllByRole('button', { name: /^Take \d/ })[0]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('formatElapsed', () => {
  it('formats as mm:ss.mmm (FR-019)', () => {
    expect(formatElapsed(0)).toBe('00:00.000');
    expect(formatElapsed(461_230)).toBe('07:41.230');
    expect(formatElapsed(59_999)).toBe('00:59.999');
    expect(formatElapsed(-5)).toBe('00:00.000');
  });
});
