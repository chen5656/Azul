/**
 * Difficulty-ladder bench (BUILD-SPEC §14.5, AC-030). Manual — not part of CI,
 * because a single extreme-vs-master pass runs for over an hour.
 *
 *   npm run bench                       # every rung, 120 games each
 *   npm run bench -- --games 20 --pairs medium-vs-easy
 *
 * Each pair is one rung of the ladder: every level must beat the level directly
 * below it, which is the whole promise the difficulty names make. Seats are
 * swapped every other game so neither agent keeps the first-player advantage.
 * Results are appended to `web/docs/ts_ai_benchmarks.md`.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { QuadroGame } from '../src/engine';
import { type Agent, type AgentLevel, LEVELS, makeAgent } from '../src/ai';

interface PairSpec {
  name: string;
  challenger: AgentLevel;
  incumbent: AgentLevel;
  /** minimum win rate for the challenger */
  target: number;
}

/**
 * Every adjacent pair on the ladder. The bar is 55% — a level that cannot clear
 * a coin flip against the one below it is not a separate difficulty. The bottom
 * rung is a wide gap (half-random play against a real opponent model), so it is
 * held to more.
 */
const TARGETS: Partial<Record<AgentLevel, number>> = { medium: 0.75 };

const PAIRS: PairSpec[] = LEVELS.slice(1).map((level, i) => ({
  name: `${level}-vs-${LEVELS[i]}`,
  challenger: level,
  incumbent: LEVELS[i],
  target: TARGETS[level] ?? 0.55,
}));

function build(level: AgentLevel, seed: number, budget: number): Agent {
  return makeAgent(level, seed, budget);
}

interface Outcome {
  wins: number;
  losses: number;
  draws: number;
  games: number;
  maxMoveMs: number;
  totalMoveMs: number;
  moves: number;
}

function playPair(spec: PairSpec, games: number, budget: number): Outcome {
  const out: Outcome = {
    wins: 0, losses: 0, draws: 0, games, maxMoveMs: 0, totalMoveMs: 0, moves: 0,
  };

  for (let i = 0; i < games; i += 1) {
    // Swap seats every other game so the first-player edge cancels out.
    const challengerSeat = i % 2;
    const game = new QuadroGame(1000 + i);
    const agents: Agent[] = [];
    agents[challengerSeat] = build(spec.challenger, 7000 + i, budget);
    agents[1 - challengerSeat] = build(spec.incumbent, 8000 + i, budget);

    while (!game.isOver()) {
      const seat = game.state.current;
      const started = performance.now();
      const action = agents[seat].choose(game.state, seat);
      const elapsed = performance.now() - started;
      out.totalMoveMs += elapsed;
      out.moves += 1;
      if (elapsed > out.maxMoveMs) out.maxMoveMs = elapsed;
      game.step(action);
    }

    const result = game.result();
    if (result.draw) out.draws += 1;
    else if (result.winner === challengerSeat) out.wins += 1;
    else out.losses += 1;

    process.stdout.write(
      `\r  ${spec.name}: ${i + 1}/${games} — ${out.wins}W ${out.losses}L ${out.draws}D`,
    );
  }
  process.stdout.write('\n');
  return out;
}

function parseArgs(argv: string[]): { games: number; budget: number; pairs: PairSpec[] } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = get('--pairs');
  return {
    games: Number(get('--games') ?? 120),
    budget: Number(get('--budget') ?? 0.45),
    pairs: only ? PAIRS.filter((p) => only.split(',').includes(p.name)) : PAIRS,
  };
}

function main(): void {
  const { games, budget, pairs } = parseArgs(process.argv.slice(2));
  const rows: string[] = [];
  let allMet = true;

  console.log(`strength bench: ${games} games per pair, ${budget * 1000}ms search budget\n`);
  for (const spec of pairs) {
    const out = playPair(spec, games, budget);
    const rate = out.wins / out.games;
    const met = rate >= spec.target;
    allMet &&= met;
    console.log(
      `  ${spec.name}: ${(rate * 100).toFixed(1)}% (target ${(spec.target * 100).toFixed(0)}%) ` +
        `${met ? 'PASS' : 'FAIL'} — max move ${out.maxMoveMs.toFixed(0)}ms, ` +
        `mean ${(out.totalMoveMs / out.moves).toFixed(1)}ms\n`,
    );
    rows.push(
      `| ${spec.name} | ${out.games} | ${out.wins} | ${out.losses} | ${out.draws} | ` +
        `${(rate * 100).toFixed(1)}% | ${(spec.target * 100).toFixed(0)}% | ` +
        `${met ? 'pass' : 'FAIL'} | ${out.maxMoveMs.toFixed(0)}ms | ` +
        `${(out.totalMoveMs / out.moves).toFixed(1)}ms |`,
    );
  }

  const docs = fileURLToPath(new URL('../docs/', import.meta.url));
  mkdirSync(docs, { recursive: true });
  const report = [
    ``,
    `## Run ${new Date().toISOString()}`,
    ``,
    `Node ${process.version} on ${process.platform}/${process.arch}. `
      + `${games} games per pair, ${budget * 1000}ms budget, seats swapped every game.`,
    ``,
    `| pair | games | W | L | D | win rate | target | result | max move | mean move |`,
    `|---|---|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
  ].join('\n');
  appendFileSync(`${docs}ts_ai_benchmarks.md`, report, 'utf-8');

  console.log(`appended to web/docs/ts_ai_benchmarks.md`);
  process.exitCode = allMet ? 0 : 1;
}

main();
