/**
 * Building and reading shareable replay links.
 *
 * The code rides in the URL *fragment*, never the query string: fragments are
 * not sent to the server, so a shared game never reaches an access log or a
 * referrer header.
 */

import type { QuadroGame } from '../engine';
import { type Replay, type ReplayAiLevel, encodeReplay } from './codec';
import { ENGINE_VERSION } from './version';

export const REPLAY_PATH = '/replay';

/** Snapshot a finished (or in-progress) game as a shareable replay. */
export function replayOf(
  game: QuadroGame,
  options: { aiLevel: ReplayAiLevel; humanSeat: number; puzzleId: string | null },
): Replay {
  const scores = game.state.players.map((p) => p.score);
  return {
    engineVersion: ENGINE_VERSION,
    seed: game.seed,
    firstPlayer: game.firstPlayer,
    humanSeat: options.humanSeat,
    aiLevel: options.aiLevel,
    scores: [scores[0], scores[1]],
    puzzleId: options.puzzleId,
    actions: game.history.map((a) => a.actionId),
  };
}

export function replayUrl(replay: Replay, origin = window.location.origin): string {
  return `${origin}${REPLAY_PATH}#${encodeReplay(replay)}`;
}

/**
 * The text recap that gets pasted next to the link.
 *
 * Deliberately spoiler-free about *how* the game was won: it reports the
 * result, not the moves, so posting it does not give away the day's deal.
 */
export function recapText(
  replay: Replay,
  options: { levelLabel: string; elapsedMs?: number; rank?: number | null; totalEntries?: number | null },
): string {
  const mine = replay.scores[replay.humanSeat];
  const theirs = replay.scores[1 - replay.humanSeat];
  const margin = mine - theirs;
  const lines = [
    `MirrorLink ${replay.puzzleId ?? 'Practice'} · ${options.levelLabel}`,
    `${mine}–${theirs} (${margin >= 0 ? '+' : ''}${margin})${
      options.elapsedMs === undefined ? '' : ` · ${formatDuration(options.elapsedMs)}`
    }${
      options.rank == null
        ? ''
        : ` · #${options.rank}${options.totalEntries ? ` / ${options.totalEntries}` : ''}`
    }`,
  ];
  return lines.join('\n');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
