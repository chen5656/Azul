/**
 * Practice: any level, any seed, nothing recorded (FR-010 … FR-015).
 *
 * Fully playable offline (FR-014); it never touches the network, and a Practice
 * game issues no request at all (AC-006, AC-007).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { QuadroGame } from '../engine';
import { LEVELS, LEVEL_LABELS, type AgentLevel } from '../ai';
import { Board } from '../components/Board';
import { RobotAvatar } from '../components/RobotAvatar';
import { useGameSession } from '../game/useGameSession';
import { storage } from '../storage';
import { useRouter } from '../router';

export const MIN_SEED = 0;
export const MAX_SEED = 2 ** 31 - 1;

export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

export function isValidSeed(text: string): boolean {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isSafeInteger(num) && num >= MIN_SEED && num <= MAX_SEED;
}

interface Setup {
  level: AgentLevel;
  seed: number;
}

export function Practice() {
  const [setup, setSetup] = useState<Setup | null>(null);
  return setup ? (
    // Keyed on the seed so a new deal remounts the session with a fresh engine.
    <PracticeGame
      key={setup.seed}
      setup={setup}
      onExit={() => setSetup(null)}
      onNewDeal={(seed) => setSetup({ ...setup, seed })}
    />
  ) : (
    <PracticeSetup onStart={setSetup} />
  );
}

function PracticeSetup({ onStart }: { onStart: (setup: Setup) => void }) {
  const { search } = useRouter();
  const remembered = storage.practiceLevel() as AgentLevel | null;
  const [level, setLevel] = useState<AgentLevel>(
    remembered && LEVELS.includes(remembered) ? remembered : 'medium',
  );

  const seedParam = useMemo(() => {
    const params = new URLSearchParams(
      search || (typeof window !== 'undefined' ? window.location.search : ''),
    );
    return params.get('seed');
  }, [search]);

  const [seedText, setSeedText] = useState(seedParam ?? '');

  useEffect(() => {
    setSeedText(seedParam ?? '');
  }, [seedParam]);

  const seedValid = seedText.trim() === '' || isValidSeed(seedText);

  const start = () => {
    if (!seedValid) return;
    const seed = seedText.trim() === '' ? randomSeed() : Number(seedText.trim());
    storage.setPracticeLevel(level);
    storage.setPracticeSeed(String(seed));
    onStart({ level, seed });
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">Practice</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Play any opponent, on any deal, as often as you like. Nothing here is timed, recorded or
        submitted anywhere.
      </p>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-neutral-300">Opponent</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LEVELS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setLevel(candidate)}
              aria-pressed={level === candidate}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                level === candidate
                  ? 'border-sky-400 bg-sky-950/60 ring-1 ring-sky-400/50'
                  : 'border-neutral-700 hover:bg-neutral-800'
              }`}
            >
              <RobotAvatar level={candidate} className="h-8 w-8" />
              <span className="font-medium">{LEVEL_LABELS[candidate]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <details className="mt-5 text-sm" open={Boolean(seedParam && seedParam.trim() !== '')}>
        <summary className="cursor-pointer select-none text-xs font-medium text-neutral-400 hover:text-neutral-300">
          Specific deal seed (optional)
        </summary>
        <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <label htmlFor="seed" className="block text-xs font-medium text-neutral-300">
            Seed
          </label>
          <input
            id="seed"
            inputMode="numeric"
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
            placeholder="leave blank for a random deal"
            aria-invalid={!seedValid}
            aria-describedby="seed-help"
            className={`mt-1.5 w-full rounded-md border bg-neutral-900 px-3 py-1.5 text-sm ${
              seedValid ? 'border-neutral-700' : 'border-red-500'
            }`}
          />
          <p id="seed-help" className="mt-1 text-xs text-neutral-500">
            {seedValid
              ? `A whole number from 0 to ${MAX_SEED}. Leave blank for a random deal.`
              : `Please enter a whole number between 0 and ${MAX_SEED}, or leave blank.`}
          </p>
        </div>
      </details>

      <button
        type="button"
        disabled={!seedValid}
        onClick={start}
        className="mt-6 w-full rounded-lg bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500 disabled:opacity-50"
      >
        Start playing
      </button>
    </div>
  );
}

function PracticeGame({
  setup,
  onExit,
  onNewDeal,
}: {
  setup: Setup;
  onExit: () => void;
  onNewDeal: (seed: number) => void;
}) {
  const deal = setup.seed;
  const newGame = useCallback(() => new QuadroGame(deal), [deal]);
  const ai = useMemo(
    () => ({ level: setup.level, seed: deal ^ 0x5f3759df }),
    [setup.level, deal],
  );
  const session = useGameSession({ newGame, ai, timed: false });
  const opponentLabel = LEVEL_LABELS[setup.level];

  const topRight = (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <span className="text-xs text-neutral-500 font-mono mr-1">Seed {deal}</span>
      <button
        type="button"
        onClick={session.restart}
        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs sm:text-sm hover:bg-neutral-800"
      >
        Restart
      </button>
      <button
        type="button"
        onClick={() => {
          const next = randomSeed();
          storage.setPracticeSeed(String(next));
          onNewDeal(next);
        }}
        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs sm:text-sm hover:bg-neutral-800"
      >
        New deal
      </button>
      <button
        type="button"
        onClick={onExit}
        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs sm:text-sm hover:bg-neutral-800"
      >
        Change setup
      </button>
    </div>
  );

  return (
    <Board
      session={session}
      humanLabel="You"
      opponentLabel={opponentLabel}
      topRight={topRight}
      title="Practice"
    />
  );
}
