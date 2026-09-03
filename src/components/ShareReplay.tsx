/**
 * The share control shown when a game ends.
 *
 * The link carries the whole game in its fragment (`src/replay/codec.ts`), so
 * sharing needs no account, no server round-trip and no stored row — and the
 * recipient watches the moves rather than reading a number.
 */

import type { QuadroGame } from '../engine';
import type { ReplayAiLevel } from '../replay/codec';
import { replayOf, replayUrl } from '../replay/share';

export function ShareReplay({
  game,
  aiLevel,
  humanSeat,
  puzzleId,
}: {
  game: QuadroGame;
  aiLevel: ReplayAiLevel;
  levelLabel: string;
  humanSeat: number;
  puzzleId: string | null;
  elapsedMs?: number;
  rank?: number | null;
  totalEntries?: number | null;
}) {
  let url: string;
  try {
    const replay = replayOf(game, { aiLevel, humanSeat, puzzleId });
    url = replayUrl(replay);
  } catch {
    // An unshareable game (absurdly long) must not take the results panel down
    // with it.
    return null;
  }

  return (
    <div className="mt-3 border-t border-neutral-800 pt-3">
      <p className="mb-2 text-xs text-neutral-400">
        Share the whole game — the link replays every move, yours and the opponent’s.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex cursor-pointer items-center justify-center rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
      >
        Watch it
      </a>
    </div>
  );
}
