import type { Session } from '../game/useGameSession';

export function TurnActionCard({
  session,
  opponentLabel = 'Opponent',
}: {
  session: Session;
  opponentLabel?: string;
  onUndo?: () => void;
}) {
  const { status, error, selection } = session;

  const isYourTurn = status === 'idle' || status === 'your-turn';
  const isAiThinking = status === 'ai-thinking';
  const isGameOver = status === 'game-over';
  if (isGameOver) {
    return null;
  }

  let title = 'Your turn';
  let message = 'Pick tokens from an attention node or the buffer.';

  if (error) {
    title = 'Error';
    message = `Opponent error: ${error}`;
  } else if (isAiThinking) {
    title = `${opponentLabel}'s turn`;
    message = `${opponentLabel} is thinking…`;
  } else if (selection) {
    title = 'Stage Tokens';
    message = 'Choose a context line on your board or the hallucination line.';
  }

  return (
    <div className="flex flex-col justify-between rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
      <div role="status">
        <h3
          className={`text-xs font-semibold uppercase tracking-wider ${
            isYourTurn ? 'text-sky-400' : isAiThinking ? 'text-amber-400' : 'text-neutral-400'
          }`}
        >
          {title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
          {message}
        </p>
      </div>
    </div>
  );
}
