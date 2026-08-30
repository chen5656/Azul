import type { Session } from '../game/useGameSession';
import { GameOverBurst } from './GameOverBurst';

/**
 * What the board is doing right now. The AI-thinking state is deliberately
 * loud: in the Daily that time is on the player's clock (D-012).
 */
export function StatusLine({ session, opponentLabel }: { session: Session; opponentLabel: string }) {
  const { status, error, aiMode, game, humanSeat, humanWon } = session;

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-300">
        The opponent could not move: {error}. This attempt cannot be finished or submitted.
      </p>
    );
  }

  if (status === 'game-over') {
    const result = game.result();
    const mine = result.scores[humanSeat];
    const theirs = result.scores[1 - humanSeat];
    const verdict = result.draw ? 'Draw' : humanWon ? 'You win' : 'You lose';
    return (
      <>
        <GameOverBurst
          text={verdict}
          tone={result.draw ? 'draw' : humanWon ? 'win' : 'lose'}
        />
        <p className="text-sm" role="status">
        <span className={humanWon ? 'font-semibold text-sky-300' : 'font-semibold text-neutral-300'}>
          {result.draw ? 'Draw' : humanWon ? 'You win' : `${opponentLabel} wins`}
        </span>{' '}
        <span className="tabular-nums text-neutral-400">
          {mine} – {theirs}
        </span>
        </p>
      </>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-neutral-400" role="status">
      {status === 'ai-thinking' ? (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          {opponentLabel} is thinking…
        </>
      ) : session.selection ? (
        'Now choose where the tiles go.'
      ) : (
        'Your turn — pick a color from a factory or the center.'
      )}
      {aiMode === 'main-thread' && (
        <span className="text-xs text-amber-300">
          (AI running on the main thread — performance may be reduced)
        </span>
      )}
    </p>
  );
}
