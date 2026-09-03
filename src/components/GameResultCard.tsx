import { useState } from 'react';
import { LEVEL_LABELS, type AgentLevel } from '../ai';
import { RobotAvatar } from './RobotAvatar';
import { formatElapsed } from './Timer';
import type { SubmissionState } from '../game/useSubmission';
import { isRankedLevel } from '../daily/levels';
import { Link } from '../router';

export interface GameResultCardProps {
  humanWon: boolean;
  draw?: boolean;
  elapsedMs: number;
  aiLevel: AgentLevel;
  humanScore: number;
  opponentScore: number;
  /** Leaderboard submission state (for daily games) */
  submissionState?: SubmissionState;
  /** Whether the game difficulty was ranked */
  ranked?: boolean;
  onPlayAgain: () => void;
  onWatchReplay?: () => void;
  onSwitchToRanked?: () => void;
  onRetrySubmit?: () => void;
  onDiscardSubmit?: () => void;
  onOpenSignIn?: () => void;
}

export function GameResultCard({
  humanWon,
  draw = false,
  elapsedMs,
  aiLevel,
  humanScore,
  opponentScore,
  submissionState,
  ranked = isRankedLevel(aiLevel),
  onPlayAgain,
  onWatchReplay,
  onSwitchToRanked,
  onRetrySubmit,
  onOpenSignIn,
}: GameResultCardProps) {
  const [copied, setCopied] = useState(false);
  const opponentName = LEVEL_LABELS[aiLevel] ?? aiLevel;
  const timeFormatted = formatElapsed(elapsedMs);

  const handleShareClick = () => {
    // Placeholder action for share
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isWin = humanWon && !draw;
  const isLose = !humanWon && !draw;

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Top Banner Row: Unranked Notice & Share Game Placeholder */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!ranked ? (
          <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/90 px-3.5 py-1.5 text-xs text-neutral-300 shadow-sm backdrop-blur-sm sm:text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs">
              🏆
            </span>
            <span className="font-semibold text-neutral-200">
              {opponentName} games aren&apos;t ranked
            </span>
            <span className="text-neutral-500">•</span>
            <span className="text-neutral-400">
              Expert, Master &amp; Extreme count toward today&apos;s leaderboard.
            </span>
            {onSwitchToRanked && (
              <button
                type="button"
                onClick={onSwitchToRanked}
                className="ml-1 inline-flex items-center gap-1 font-semibold text-amber-400 transition hover:text-amber-300 hover:underline"
              >
                Play Expert &rarr;
              </button>
            )}
          </div>
        ) : (
          <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-sky-900/60 bg-sky-950/40 px-3.5 py-1.5 text-xs text-sky-200 shadow-sm backdrop-blur-sm sm:text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs">
              🏆
            </span>
            <span className="font-semibold text-sky-300">Ranked Game</span>
            <span className="text-sky-500/60">•</span>
            <span className="text-neutral-300">
              Counts toward today&apos;s {opponentName} leaderboard
            </span>
            <Link
              to={`/leaderboard?ai=${aiLevel}`}
              className="ml-1 font-semibold text-sky-400 hover:text-sky-300 hover:underline"
            >
              View Board &rarr;
            </Link>
          </div>
        )}

        {/* Share Button Placeholder (Requirement 2) */}
        <button
          type="button"
          onClick={handleShareClick}
          title="Share game link"
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-xs sm:text-sm font-medium text-neutral-200 shadow-sm transition hover:bg-neutral-800 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 stroke-current"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span>{copied ? 'Link copied!' : 'Share game'}</span>
        </button>
      </div>

      {/* Main Game Result Card */}
      <div
        className={`relative overflow-hidden rounded-2xl border px-5 py-6 sm:px-8 sm:py-7 shadow-2xl backdrop-blur-md transition-all ${
          isWin
            ? 'border-neutral-800 bg-[#0b1017]/95 text-neutral-100'
            : isLose
              ? 'border-neutral-800 bg-[#120a0d]/95 text-neutral-100'
              : 'border-neutral-800 bg-[#101216]/95 text-neutral-100'
        }`}
      >
        {/* Subtle Ambient Radial Glow */}
        {isWin && (
          <div
            className="pointer-events-none absolute inset-0 -z-10 select-none opacity-60"
            style={{
              background:
                'radial-gradient(circle 350px at 50% 40%, rgba(14, 165, 233, 0.18), transparent 70%), radial-gradient(circle 600px at 50% 50%, rgba(56, 189, 248, 0.06), transparent 80%)',
            }}
          />
        )}
        {isLose && (
          <div
            className="pointer-events-none absolute inset-0 -z-10 select-none opacity-50"
            style={{
              background:
                'radial-gradient(circle 350px at 50% 40%, rgba(244, 63, 94, 0.18), transparent 70%), radial-gradient(circle 600px at 50% 50%, rgba(225, 29, 72, 0.05), transparent 80%)',
            }}
          />
        )}

        {/* Ambient sparkle particles */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none opacity-30">
          <div className="absolute top-1/4 left-1/3 h-1 w-1 rounded-full bg-white animate-pulse" />
          <div className="absolute top-1/3 right-1/4 h-1 w-1 rounded-full bg-sky-300 animate-ping" />
          <div className="absolute bottom-1/3 left-1/4 h-1 w-1 rounded-full bg-white/60" />
          <div className="absolute top-2/3 right-1/3 h-1.5 w-1.5 rounded-full bg-sky-400/80 animate-pulse" />
        </div>

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-6 lg:gap-8">
          {/* Left Column: Robot Avatar, Outcome Text & Scores */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Top row: Avatar + outcome text */}
            <div className="flex items-center gap-3.5">
              <div
                className={`relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-full p-2 ${
                  isWin
                    ? 'bg-sky-950/60 ring-2 ring-sky-500/40 shadow-lg shadow-sky-500/20'
                    : isLose
                      ? 'bg-rose-950/40 ring-2 ring-rose-500/30'
                      : 'bg-neutral-800 ring-2 ring-neutral-600'
                }`}
              >
                <RobotAvatar level={aiLevel} className="h-full w-full object-contain" />
              </div>

              <div className="flex flex-col min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-neutral-100 flex flex-wrap items-center gap-1.5 leading-snug">
                  {draw ? (
                    <>Tied in <span className="text-neutral-300 font-mono font-extrabold">{timeFormatted}</span></>
                  ) : isWin ? (
                    <>
                      You beat {opponentName} in{' '}
                      <span className="text-sky-400 font-mono font-extrabold">{timeFormatted}</span>
                    </>
                  ) : (
                    <>
                      You lost in{' '}
                      <span className="text-rose-400 font-mono font-extrabold">{timeFormatted}</span>
                    </>
                  )}
                </h2>
                <p className="text-xs sm:text-sm text-neutral-400 font-medium">
                  {draw ? 'Good match!' : isWin ? 'Nice work!' : 'Better luck next time!'}
                </p>
              </div>
            </div>

            {/* Bottom row: Score comparison */}
            <div className="flex items-center gap-6 pt-1">
              <div className="flex flex-col items-start">
                <span className="text-xs font-semibold text-neutral-400">You</span>
                <span
                  className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                    isWin ? 'text-sky-400' : isLose ? 'text-rose-400' : 'text-neutral-200'
                  }`}
                >
                  {humanScore}
                </span>
              </div>

              <div className="h-8 w-px bg-neutral-800" />

              <div className="flex flex-col items-start">
                <span className="text-xs font-semibold text-neutral-400">Opponent</span>
                <span
                  className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                    isWin ? 'text-rose-400' : isLose ? 'text-sky-400' : 'text-neutral-200'
                  }`}
                >
                  {opponentScore}
                </span>
              </div>
            </div>
          </div>

          {/* Center Column: Big Title & Status Details */}
          <div className="flex flex-col items-center justify-center text-center py-2 min-w-0 lg:px-4">
            <div
              className={`font-black tracking-widest uppercase select-none text-4xl sm:text-5xl lg:text-6xl ${
                isWin
                  ? 'bg-gradient-to-b from-sky-100 via-sky-300 to-sky-500 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(56,189,248,0.5)]'
                  : isLose
                    ? 'bg-gradient-to-b from-rose-100 via-rose-300 to-rose-500 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(244,63,94,0.5)]'
                    : 'bg-gradient-to-b from-neutral-100 via-neutral-300 to-neutral-500 bg-clip-text text-transparent'
              }`}
            >
              {draw ? 'DRAW!' : isWin ? 'YOU WIN!' : 'GAME OVER'}
            </div>

            {/* Status / Leaderboard Details Box */}
            <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800/80 bg-neutral-900/60 px-4 py-2.5 text-xs text-neutral-300 shadow-inner backdrop-blur-sm min-h-[44px] flex items-center justify-center">
              {submissionState?.kind === 'submitting' && (
                <span className="text-sky-300 animate-pulse">Posting your score to today&apos;s leaderboard…</span>
              )}
              {submissionState?.kind === 'posted' && (
                <span className="text-neutral-200">
                  🎉 Personal best — <span className="font-bold text-sky-300">Rank {submissionState.rank}</span> of {submissionState.totalEntries} today on{' '}
                  <Link to={`/leaderboard?ai=${aiLevel}`} className="font-semibold text-sky-400 underline hover:text-sky-300">
                    {opponentName} Board
                  </Link>
                </span>
              )}
              {submissionState?.kind === 'not-improved' && (
                <span className="text-neutral-400">
                  Completed! Previous best was higher, so board keeps existing record.
                </span>
              )}
              {submissionState?.kind === 'awaiting-auth' && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span>Sign in to record your score:</span>
                  <button
                    type="button"
                    onClick={onOpenSignIn}
                    className="rounded bg-sky-600 px-2.5 py-0.5 font-semibold text-white hover:bg-sky-500"
                  >
                    Sign in
                  </button>
                </div>
              )}
              {submissionState?.kind === 'failed' && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-rose-300">
                  <span>{submissionState.message}</span>
                  {onRetrySubmit && (
                    <button
                      type="button"
                      onClick={onRetrySubmit}
                      className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700 text-neutral-200"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
              {!submissionState && (
                <span className="text-neutral-400">
                  {ranked ? 'Scores recorded for ranked match' : 'Practice mode — unrecorded match'}
                </span>
              )}
            </div>
          </div>

          {/* Right Column: Actions & Placeholders */}
          <div className="flex flex-col items-stretch lg:items-end justify-center gap-2.5 min-w-0">
            {/* Top Placeholder Box */}
            <div className="hidden lg:block h-8 w-44 rounded-lg border border-neutral-800/40 bg-neutral-800/30" />

            {/* Watch replay button */}
            {onWatchReplay && (
              <button
                type="button"
                onClick={onWatchReplay}
                className="inline-flex w-full lg:w-44 cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-500 active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Watch replay</span>
              </button>
            )}

            {/* Play again button */}
            <button
              type="button"
              onClick={onPlayAgain}
              className="inline-flex w-full lg:w-44 cursor-pointer items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/80 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-800 hover:text-white active:scale-[0.98]"
            >
              Play again
            </button>

            {/* Bottom Placeholder Box */}
            <div className="hidden lg:block h-8 w-44 rounded-lg border border-neutral-800/40 bg-neutral-800/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
