/** Leaderboard states (§9.3): populated, own rank pinned, empty, offline. */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Leaderboard } from '../../src/components/Leaderboard';

vi.mock('../../src/auth/clerk', () => ({
  useIdentity: () => ({
    signedIn: false,
    available: false,
    displayName: null,
    getToken: async () => null,
  }),
}));

const ENTRY = {
  rank: 1, display_name: 'ada', elapsed_ms: 461_230, final_score: 64, opponent_score: 51,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respond(body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('leaderboard', () => {
  it("renders today's entries with rank, name, scores and time (FR-034)", async () => {
    respond({ puzzle_id: '2026-08-28', entries: [ENTRY], total_entries: 1, me: null });
    render(<Leaderboard aiLevel="extreme" puzzleId="2026-08-28" />);
    await waitFor(() => expect(screen.getByText('ada')).toBeInTheDocument());
    // Beside the game the score is the margin, and the time is whole seconds.
    expect(screen.getByText('07:41')).toBeInTheDocument();
    expect(screen.getByText('+13')).toBeInTheDocument();
    expect(screen.queryByText('64')).not.toBeInTheDocument();
    expect(screen.queryByText('51')).not.toBeInTheDocument();
  });

  it('pins the player below the list when they are outside it (AC-026)', async () => {
    respond({
      puzzle_id: '2026-08-28',
      entries: [ENTRY],
      total_entries: 112,
      me: { rank: 112, elapsed_ms: 903_118, final_score: 55, opponent_score: 50 },
    });
    render(<Leaderboard aiLevel="extreme" puzzleId="2026-08-28" />);
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument());
    expect(screen.getByText('112')).toBeInTheDocument();
    expect(screen.getByText('15:03')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('breaks the margin out into both scores in the full variant', async () => {
    respond({ puzzle_id: '2026-08-28', entries: [ENTRY], total_entries: 1, me: null });
    render(<Leaderboard aiLevel="extreme" puzzleId="2026-08-28" variant="full" />);
    await waitFor(() => expect(screen.getByText('ada')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Score' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'User score' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Agent score' })).toBeInTheDocument();
    expect(screen.getByText('+13')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('51')).toBeInTheDocument();
  });

  it('renders an empty board as a sentence, not a spinner (AC-028)', async () => {
    respond({ puzzle_id: '2026-08-28', entries: [], total_entries: 0, me: null });
    render(<Leaderboard aiLevel="extreme" puzzleId="2026-08-28" />);
    await waitFor(() =>
      expect(screen.getByText(/Nobody has played it yet today/i)).toBeInTheDocument(),
    );
  });

  it('shows an offline state rather than an error (FR-037)', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    render(<Leaderboard aiLevel="extreme" puzzleId="2026-08-28" />);
    await waitFor(() =>
      expect(screen.getByText(/scores aren't recorded right now/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<Leaderboard aiLevel="extreme" puzzleId="2026-08-28" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument(),
    );
  });
});
