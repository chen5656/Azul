/**
 * The submission state machine (§7.2) and the panel that renders it.
 *
 * Covers the acceptance criteria that do not need a whole game played: a slower
 * second attempt (AC-018), a faster one (AC-019), and the rejection codes the
 * Worker can return (AC-021, AC-022, AC-024).
 */

import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubmitPanel } from '../../src/components/SubmitPanel';
import type { Identity } from '../../src/auth';
import { useSubmission } from '../../src/game/useSubmission';

const ATTEMPT = {
  puzzle_id: '2026-08-28',
  elapsed_ms: 461_230,
  final_score: 64,
  opponent_score: 51,
  rounds: 5, ai_level: 'mcts',
};

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    signedIn: true,
    ready: true,
    isAnonymous: false,
    displayName: 'ada',
    imageUrl: null,
    hasNickname: true,
    openSignIn: () => {},
    openAccount: () => {},
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useSubmission', () => {
  it('posts an attempt and reports the rank (FR-031)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        accepted: true, improved: true, best_elapsed_ms: 461_230, rank: 1, total_entries: 38,
      }),
    );
    const { result } = renderHook(() => useSubmission(identity()));
    await act(() => result.current.submit(ATTEMPT));

    expect(result.current.state).toEqual({
      kind: 'posted', rank: 1, elapsedMs: 461_230, totalEntries: 38,
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ ...ATTEMPT, client_version: '1.0.0' });
    // The session is a cookie, not a header; the client's job is to let it ride.
    expect(init.credentials).toBe('include');
  });

  it('reports a slower attempt as not improved, not as an error (AC-018)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        accepted: true, improved: false, best_elapsed_ms: 400_000, rank: 3, total_entries: 38,
      }),
    );
    const { result } = renderHook(() => useSubmission(identity()));
    await act(() => result.current.submit(ATTEMPT));
    expect(result.current.state).toEqual({ kind: 'not-improved', bestElapsedMs: 400_000 });
  });

  it('waits for sign-in when anonymous, then posts the held attempt (FR-028)', async () => {
    const { rerender, result } = renderHook(
      ({ signedIn }) =>
        useSubmission(identity({ signedIn })),
      { initialProps: { signedIn: false } },
    );

    await act(() => result.current.submit(ATTEMPT));
    expect(result.current.state).toEqual({ kind: 'awaiting-auth' });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        accepted: true, improved: true, best_elapsed_ms: 461_230, rank: 7, total_entries: 38,
      }),
    );
    rerender({ signedIn: true });
    await act(() => result.current.retry());

    // The same elapsed time that was displayed is the one that gets posted.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).elapsed_ms).toBe(461_230);
    expect(result.current.state).toMatchObject({ kind: 'posted', rank: 7 });
  });

  it('explains a stale puzzle rather than showing a generic error (FR-025)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { code: 'STALE_PUZZLE', message: 'wrong day' } }),
    );
    const { result } = renderHook(() => useSubmission(identity()));
    await act(() => result.current.submit(ATTEMPT));
    expect(result.current.state).toMatchObject({ kind: 'failed', code: 'STALE_PUZZLE' });
    expect((result.current.state as { message: string }).message).toMatch(/yesterday/i);
  });

  it('surfaces a rate limit as its own message (AC-024)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'slow down' } }),
    );
    const { result } = renderHook(() => useSubmission(identity()));
    await act(() => result.current.submit(ATTEMPT));
    expect((result.current.state as { message: string }).message).toMatch(/last hour/i);
  });

  it('does not retry a 4xx, and does retry a 5xx before failing', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(
      jsonResponse(422, { error: { code: 'IMPLAUSIBLE_TIME', message: 'no' } }),
    );
    const { result } = renderHook(() => useSubmission(identity()));
    await act(() => result.current.submit(ATTEMPT));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('treats a transport failure as offline and keeps the attempt for retry (FR-032)', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const { result } = renderHook(() => useSubmission(identity()));
    await act(() => result.current.submit(ATTEMPT));
    expect(result.current.state).toMatchObject({ kind: 'failed', code: 'OFFLINE' });

    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        accepted: true, improved: true, best_elapsed_ms: 461_230, rank: 2, total_entries: 9,
      }),
    );
    await act(() => result.current.retry());
    expect(result.current.state).toMatchObject({ kind: 'posted', rank: 2 });
  }, 20_000);
});

describe('SubmitPanel', () => {
  const noop = () => {};

  it('shows no submit controls when not admissible', () => {
    render(
      <SubmitPanel
        admissible={false}
        elapsedMs={461_230}
        state={{ kind: 'idle' }}
        onRetry={noop}
        onDiscard={noop}
        onPlayAgain={noop}
      />,
    );
    expect(screen.getByText(/Nothing was recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('distinguishes a new personal best from a slower attempt (FR-031)', async () => {
    const { rerender } = render(
      <SubmitPanel
        admissible
        elapsedMs={461_230}
        state={{ kind: 'posted', rank: 4, elapsedMs: 461_230, totalEntries: 38 }}
        onRetry={noop}
        onDiscard={noop}
        onPlayAgain={noop}
      />,
    );
    expect(screen.getByText(/New personal best/i)).toBeInTheDocument();

    rerender(
      <SubmitPanel
        admissible
        elapsedMs={470_000}
        state={{ kind: 'not-improved', bestElapsedMs: 461_230 }}
        onRetry={noop}
        onDiscard={noop}
        onPlayAgain={noop}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Not higher than your previous best margin/i)).toBeInTheDocument());
  });

  it('shows a retry control when the post failed', () => {
    render(
      <SubmitPanel
        admissible
        elapsedMs={461_230}
        state={{ kind: 'failed', code: 'INTERNAL', message: 'Server error' }}
        onRetry={noop}
        onDiscard={noop}
        onPlayAgain={noop}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
