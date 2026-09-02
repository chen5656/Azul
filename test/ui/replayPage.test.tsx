/**
 * `/replay#<code>` end to end.
 *
 * The point of these is that the replay is drawn by the *real* board: the page
 * decodes a code, rebuilds the position with the engine and hands it to
 * `Board`, so a viewer sees the same surface the game was played on. They also
 * pin the two refusals — a damaged code and a code from another engine version
 * — because playing either back would render a game that never happened.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GreedyAgent } from '../../src/ai';
import { QuadroGame } from '../../src/engine';
import { encodeReplay } from '../../src/replay/codec';
import { ENGINE_VERSION } from '../../src/replay/version';
import { ReplayPage } from '../../src/routes/ReplayPage';
import { RouterProvider } from '../../src/router';

vi.mock('../../src/auth', () => ({
  useIdentity: () => ({
    signedIn: false,
    ready: true,
    isAnonymous: false,
    displayName: null,
    imageUrl: null,
    hasNickname: false,
    openSignIn: () => {},
    openAccount: () => {},
  }),
}));

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

/** A real finished game, encoded the way the app encodes one. */
function codeForGame(engineVersion = ENGINE_VERSION) {
  const game = new QuadroGame(4242, 0);
  const agent = new GreedyAgent(1, 0);
  while (!game.isOver()) game.step(agent.choose(game.state, game.state.current));
  const result = game.result();
  return {
    game,
    code: encodeReplay({
      engineVersion,
      seed: game.seed,
      firstPlayer: game.firstPlayer,
      humanSeat: 0,
      aiLevel: 'extreme',
      scores: [result.scores[0], result.scores[1]],
      puzzleId: '2026-08-28',
      actions: game.history.map((a) => a.actionId),
    }),
  };
}

function renderAt(hash: string) {
  window.history.pushState({}, '', `/replay#${hash}`);
  return render(
    <RouterProvider>
      <ReplayPage />
    </RouterProvider>,
  );
}

describe('the replay page', () => {
  it('decodes a shared game and shows its result', async () => {
    const { code } = codeForGame();
    renderAt(code);

    expect(await screen.findByText(/Replay · 2026-08-28/)).toBeInTheDocument();
    // The whole game is in the link: no request is made to load it.
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  });

  it('starts at the opening deal, not the finished position', async () => {
    const { code, game } = codeForGame();
    renderAt(code);

    await screen.findByText(/Replay · 2026-08-28/);
    expect(screen.getByText(new RegExp(`move 0 / ${game.history.length}`))).toBeInTheDocument();
  });

  it('advances one recorded move at a time', async () => {
    const user = userEvent.setup();
    const { code } = codeForGame();
    renderAt(code);

    await screen.findByText(/move 0 \//);
    await user.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => expect(screen.getByText(/move 1 \//)).toBeInTheDocument());
  });

  it('seeks to any move and back to the start', async () => {
    const user = userEvent.setup();
    const { code } = codeForGame();
    renderAt(code);

    await screen.findByText(/move 0 \//);
    await user.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => expect(screen.getByText(/move 1 \//)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(screen.getByText(/move 0 \//)).toBeInTheDocument());
  });

  it('refuses a replay recorded by a different engine version', async () => {
    const { code } = codeForGame(ENGINE_VERSION + 1);
    renderAt(code);

    expect(
      await screen.findByText(/from an older version of the game/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  });

  it('refuses a damaged link rather than drawing a wrong board', async () => {
    renderAt('this-is-not-a-replay');
    expect(await screen.findByText(/link is damaged/i)).toBeInTheDocument();
  });

  it('explains an empty link', async () => {
    renderAt('');
    expect(await screen.findByText(/No replay in this link/i)).toBeInTheDocument();
  });
});
