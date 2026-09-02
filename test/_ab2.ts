import { QuadroGame } from '../src/engine';
import { MctsAgent } from '../src/ai';
import { LegacyMctsAgent } from './_legacyMcts';

const mode = process.argv[2];           // 'ab' | 'control'
const SIMS = Number(process.argv[3] ?? 300);
const GAMES = Number(process.argv[4] ?? 60);
const mk = (which: string, seed: number) =>
  which === 'old'
    ? new LegacyMctsAgent({ seed, maxSimulations: SIMS, timeBudget: 1e6 })
    : new MctsAgent({ seed, simulations: SIMS, safetyCapMs: 1e9 });
const bSide = mode === 'control' ? 'old' : 'new';

let aWins = 0, bWins = 0, draws = 0;
for (let i = 0; i < GAMES; i++) {
  const aSeat = i % 2;
  const game = new QuadroGame(3000 + i);
  const agents: any[] = [];
  agents[aSeat] = mk('old', 100 + i);
  agents[1-aSeat] = mk(bSide, 900 + i);   // distinct seed streams
  while (!game.isOver()) game.step(agents[game.state.current].choose(game.state, game.state.current));
  const r = game.result();
  if (r.draw) draws++; else if (r.winner === aSeat) aWins++; else bWins++;
  process.stdout.write(`\r  ${i+1}/${GAMES}: A(old) ${aWins} — B(${bSide}) ${bWins} (${draws}D)`);
}
const n = aWins + bWins;
const se = n ? 100 * Math.sqrt(0.25 / n) : 0;
console.log(`\n[${mode}] ${SIMS} sims, ${GAMES} games: old=${aWins} ${bSide}=${bWins} draws=${draws}`);
console.log(`B win rate ${(100*bWins/GAMES).toFixed(1)}%  (±${(1.96*se).toFixed(1)} at 95%)`);
