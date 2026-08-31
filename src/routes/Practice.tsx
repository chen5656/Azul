/**
 * Practice: any level, any seed, nothing recorded (FR-010 … FR-015).
 *
 * Fully playable offline (FR-014); it never touches the network, and a Practice
 * game issues no request at all (AC-006, AC-007).
 */

import { useCallback, useMemo, useState } from 'react';

import { QuadroGame } from '../engine';
import { LEVELS, LEVEL_LABELS, type AgentLevel } from '../ai';
import { Board } from '../components/Board';
import { StatusLine } from '../components/StatusLine';
import { useGameSession } from '../game/useGameSession';
import { storage } from '../storage';

const MAX_SEED = 2 ** 31 - 1;

function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

function isValidSeed(text: string): boolean {
  return /^\d+$/.test(text.trim()) && Number(text.trim()) <= MAX_SEED;
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
  const remembered = storage.practiceLevel() as AgentLevel | null;
  const [level, setLevel] = useState<AgentLevel>(
    remembered && LEVELS.includes(remembered) ? remembered : 'medium',
  );
  const [seedText, setSeedText] = useState(storage.practiceSeed() ?? '');
  const seedValid = seedText.trim() === '' || isValidSeed(seedText);

  const start = () => {
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
              className={`rounded-lg border px-3 py-2 text-left ${
                level === candidate
                  ? 'border-sky-400 bg-sky-950/60'
                  : 'border-neutral-700 hover:bg-neutral-800'
              }`}
            >
              <span className="font-medium">{LEVEL_LABELS[candidate]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="seed" className="text-sm font-medium text-neutral-300">
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
          className={`mt-1 w-full rounded-lg border bg-neutral-900 px-3 py-2 ${
            seedValid ? 'border-neutral-700' : 'border-red-500'
          }`}
        />
        <p id="seed-help" className="mt-1 text-xs text-neutral-500">
          {seedValid
            ? `A whole number up to ${MAX_SEED}. The same seed always deals the same game.`
            : 'Enter a whole number, or leave the field blank.'}
        </p>
      </div>

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

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            Practice <span className="text-neutral-500">vs {opponentLabel}</span>
          </h1>
          <p className="text-xs text-neutral-500">
            Seed {deal} · nothing on this screen is recorded or submitted
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={session.undo}
            disabled={!session.canUndo}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
            title={`Undo last move (${session.undosRemaining} remaining)`}
          >
            Undo ({session.undosRemaining})
          </button>
          <button
            type="button"
            onClick={session.restart}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
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
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            New deal
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Change setup
          </button>
        </div>
      </header>

      <StatusLine session={session} opponentLabel={opponentLabel} />
      <Board session={session} humanLabel="You" opponentLabel={opponentLabel} />
    </div>
  );
}
