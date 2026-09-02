/**
 * Old agent vs new agent at EQUAL simulation counts.
 *
 * Both sides are deterministic and spend the same number of simulations, so the
 * result does not depend on machine load. If they are level, the only thing I
 * changed that matters is the budget's size; if the old one wins, I broke the
 * search itself (the per-position RNG is the prime suspect).
 */
import { QuadroGame } from '../src/engine';
import { MctsAgent } from '../src/ai';
import { LegacyMctsAgent } from './_legacyMcts';

const SIMS = Number(process.argv[2] ?? 300);
const GAMES = Number(process.argv[3] ?? 24);
let oldWins = 0, newWins = 0, draws = 0;
for (let i = 0; i < GAMES; i++) {
  const oldSeat = i % 2;
  const game = new QuadroGame(3000 + i);
  const agents: any[] = [];
  agents[oldSeat] = new LegacyMctsAgent({ seed: 100 + i, maxSimulations: SIMS, timeBudget: 1e6 });
  agents[1-oldSeat] = new MctsAgent({ seed: 100 + i, simulations: SIMS, safetyCapMs: 1e9 });
  while (!game.isOver()) {
    const seat = game.state.current;
    game.step(agents[seat].choose(game.state, seat));
  }
  const r = game.result();
  if (r.draw) draws++; else if (r.winner === oldSeat) oldWins++; else newWins++;
  process.stdout.write(`\r  ${i+1}/${GAMES}: old ${oldWins} — new ${newWins} (${draws}D)`);
}
console.log(`\nAT ${SIMS} SIMS over ${GAMES} games: old=${oldWins} new=${newWins} draws=${draws}`);
console.log(`new agent win rate: ${(100*newWins/GAMES).toFixed(1)}%`);
