/**
 * Server-side replay verification.
 *
 * v1.0.0 posted scores on trust (D-015): the Worker had no way to tell a real
 * game from a hand-written POST. A submission that carries its replay closes
 * that, because the replay *is* the game — re-running it here reproduces the
 * score, and every action is checked for legality on the way through.
 *
 * Verification is opt-in per submission rather than mandatory: clients built
 * before replays existed still post, and their rows are simply stored with
 * `verified = 0`. A replay that is present but wrong is rejected outright.
 */

import { decodeReplay, type ReplayAiLevel } from '../src/replay/codec';
import { verifyReplay } from '../src/replay/rebuild';
import { ENGINE_VERSION } from '../src/replay/version';

export const MAX_REPLAY_CHARS = 1024;

export interface ReplayCheck {
  ok: boolean;
  /** Rejection code for the audit trail, when `ok` is false. */
  reason?: string;
  message?: string;
}

/**
 * Check a posted replay against the score it is supposed to have produced.
 *
 * `puzzleId`/`aiLevel`/scores come from the submission payload; disagreeing
 * with the replay means one of the two was fabricated, so both are refused.
 */
export function checkReplay(
  code: string,
  claim: {
    puzzleId: string;
    aiLevel: ReplayAiLevel;
    seed: number;
    finalScore: number;
    opponentScore: number;
    rounds: number;
  },
): ReplayCheck {
  if (code.length > MAX_REPLAY_CHARS) {
    return { ok: false, reason: 'REPLAY_TOO_LONG', message: 'Replay is too long' };
  }

  let replay;
  try {
    replay = decodeReplay(code, ENGINE_VERSION);
  } catch (err) {
    return { ok: false, reason: 'REPLAY_MALFORMED', message: (err as Error).message };
  }

  if (replay.puzzleId !== claim.puzzleId) {
    return { ok: false, reason: 'REPLAY_WRONG_PUZZLE', message: 'Replay is for another puzzle' };
  }
  if (replay.seed !== claim.seed) {
    return { ok: false, reason: 'REPLAY_WRONG_SEED', message: 'Replay was not dealt from this puzzle' };
  }
  if (replay.aiLevel !== claim.aiLevel) {
    return { ok: false, reason: 'REPLAY_WRONG_LEVEL', message: 'Replay is against another opponent' };
  }

  let verdict;
  try {
    verdict = verifyReplay(replay, { checkScores: true });
  } catch (err) {
    return { ok: false, reason: 'REPLAY_MISMATCH', message: (err as Error).message };
  }

  const mine = verdict.scores[replay.humanSeat];
  const theirs = verdict.scores[1 - replay.humanSeat];
  if (mine !== claim.finalScore || theirs !== claim.opponentScore) {
    return {
      ok: false,
      reason: 'REPLAY_SCORE_MISMATCH',
      message: `Replay ends ${mine}-${theirs}, but the submission claims ${claim.finalScore}-${claim.opponentScore}`,
    };
  }
  if (verdict.rounds !== claim.rounds) {
    return {
      ok: false,
      reason: 'REPLAY_ROUND_MISMATCH',
      message: 'Replay does not run for the number of rounds claimed',
    };
  }

  return { ok: true };
}
