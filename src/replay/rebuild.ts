/**
 * Turning a `Replay` back into a game.
 *
 * Shared by the player (which steps through it one action at a time, drawing
 * with the real board components) and by the Worker, which runs it to a verdict
 * to check a posted score against the moves that supposedly produced it.
 */

import { Action, QuadroGame } from '../engine';
import type { Replay } from './codec';

export class ReplayMismatch extends Error {
  constructor(
    readonly code: 'ILLEGAL_ACTION' | 'SHORT' | 'OVERRUN' | 'SCORE_MISMATCH',
    message: string,
    /** Index of the offending action, when there is one. */
    readonly at?: number,
  ) {
    super(message);
    this.name = 'ReplayMismatch';
  }
}

/** A fresh game positioned at the replay's opening deal. */
export function replayGame(replay: Replay): QuadroGame {
  return new QuadroGame(replay.seed, replay.firstPlayer);
}

export interface ReplayVerdict {
  scores: [number, number];
  winner: number | null;
  draw: boolean;
  rounds: number;
  /** Score after each action, for scrubbing without re-running the game. */
  timeline: Array<[number, number]>;
}

/**
 * Run the whole replay, failing loudly on any inconsistency.
 *
 * Every action is checked against `isLegal` by `QuadroGame.step`, which makes a
 * corrupted or forged code fail here rather than render a nonsense board: an
 * arbitrary byte string is overwhelmingly unlikely to be a legal move sequence.
 */
export function verifyReplay(
  replay: Replay,
  options: { checkScores?: boolean } = {},
): ReplayVerdict {
  const game = replayGame(replay);
  const timeline: Array<[number, number]> = [];

  replay.actions.forEach((id, index) => {
    if (game.isOver()) {
      throw new ReplayMismatch('OVERRUN', 'The replay holds moves past the end of the game', index);
    }
    const action = Action.fromId(id);
    try {
      game.step(action);
    } catch (err) {
      throw new ReplayMismatch(
        'ILLEGAL_ACTION',
        `Move ${index + 1} (${action.describe()}) is not legal in this position`,
        index,
      );
    }
    timeline.push([game.state.players[0].score, game.state.players[1].score]);
  });

  if (!game.isOver()) {
    throw new ReplayMismatch('SHORT', 'The replay ends before the game does');
  }

  const result = game.result();
  const scores: [number, number] = [result.scores[0], result.scores[1]];

  // Off by default for playback: a build that changed the engine without
  // bumping ENGINE_VERSION should still show *something*. The Worker turns it
  // on, where a mismatch is the whole point of the check.
  if (options.checkScores) {
    const claimed = replay.scores;
    // Encoded scores are clamped at 255, so only compare within that range.
    const comparable = scores.every((s) => s <= 255);
    if (comparable && (claimed[0] !== scores[0] || claimed[1] !== scores[1])) {
      throw new ReplayMismatch(
        'SCORE_MISMATCH',
        `Replay produces ${scores[0]}-${scores[1]}, but claims ${claimed[0]}-${claimed[1]}`,
      );
    }
  }

  return { scores, winner: result.winner, draw: result.draw, rounds: result.rounds, timeline };
}
