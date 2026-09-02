/**
 * The share control shown when a game ends.
 *
 * The link carries the whole game in its fragment (`src/replay/codec.ts`), so
 * sharing needs no account, no server round-trip and no stored row — and the
 * recipient watches the moves rather than reading a number.
 */

import { useCallback, useState } from 'react';

import type { QuadroGame } from '../engine';
import type { ReplayAiLevel } from '../replay/codec';
import { recapText, replayOf, replayUrl } from '../replay/share';

type Copied = 'idle' | 'link' | 'recap' | 'failed';

export function ShareReplay({
  game,
  aiLevel,
  levelLabel,
  humanSeat,
  puzzleId,
  elapsedMs,
  rank,
  totalEntries,
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
  const [copied, setCopied] = useState<Copied>('idle');

  const copy = useCallback(async (text: string, kind: Copied) => {
    try {
      // `navigator.clipboard` is unavailable over plain http and in some
      // in-app browsers; the textarea path keeps sharing working there.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        document.body.removeChild(field);
      }
      setCopied(kind);
      window.setTimeout(() => setCopied('idle'), 2000);
    } catch {
      setCopied('failed');
    }
  }, []);

  let replay;
  let url: string;
  try {
    replay = replayOf(game, { aiLevel, humanSeat, puzzleId });
    url = replayUrl(replay);
  } catch {
    // An unshareable game (absurdly long) must not take the results panel down
    // with it.
    return null;
  }

  const recap = `${recapText(replay, { levelLabel, elapsedMs, rank, totalEntries })}\n${url}`;

  return (
    <div className="mt-3 border-t border-neutral-800 pt-3">
      <p className="mb-2 text-xs text-neutral-400">
        Share the whole game — the link replays every move, yours and the opponent’s.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy(recap, 'recap')}
          className="cursor-pointer rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
        >
          {copied === 'recap' ? 'Copied!' : 'Copy result + replay link'}
        </button>
        <button
          type="button"
          onClick={() => void copy(url, 'link')}
          className="cursor-pointer rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-neutral-700"
        >
          {copied === 'link' ? 'Copied!' : 'Copy link only'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-400 underline hover:text-neutral-200"
        >
          Watch it
        </a>
      </div>
      {copied === 'failed' && (
        <p role="alert" className="mt-2 text-xs text-amber-400">
          Could not reach the clipboard. Use “Watch it” and copy the address bar instead.
        </p>
      )}
    </div>
  );
}
