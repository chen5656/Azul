import { QuadroGame } from '../src/engine';
import { type Agent, makeAgent } from '../src/ai';

async function runMatch(totalGames = 10) {
  console.log(`=======================================================`);
  console.log(`  New Extreme (Pacing + 2.5x Boost) vs 450ms Extreme`);
  console.log(`  Total Games: ${totalGames} (Seats alternating)`);
  console.log(`=======================================================\n`);

  let newWins = 0;
  let oldWins = 0;
  let draws = 0;
  let newTotalScore = 0;
  let oldTotalScore = 0;

  for (let i = 0; i < totalGames; i++) {
    const gameSeed = 20260905 + i;
    const newSeat = i % 2; // 0 = Player 1 (first), 1 = Player 2 (second)
    const oldSeat = 1 - newSeat;

    const game = new QuadroGame(gameSeed);
    const newAgent = makeAgent('extreme', 50000 + i * 2);
    const oldAgent = makeAgent('extreme', 60000 + i * 2, { timeBudget: 0.45 });

    const agents: Agent[] = [];
    agents[newSeat] = newAgent;
    agents[oldSeat] = oldAgent;

    while (!game.isOver()) {
      const seat = game.state.current;
      const agent = agents[seat];
      const action = agent.choose(game.state, seat);
      game.step(action);
    }

    const res = game.result();
    const newScore = game.state.players[newSeat].score;
    const oldScore = game.state.players[oldSeat].score;

    newTotalScore += newScore;
    oldTotalScore += oldScore;

    let winner = 'draw';
    if (!res.draw) {
      if (res.winner === newSeat) {
        newWins++;
        winner = 'new_extreme';
      } else {
        oldWins++;
        winner = 'old_450ms';
      }
    } else {
      draws++;
    }

    const seatLabel = newSeat === 0 ? 'P1 (First)' : 'P2 (Second)';
    const winLabel = winner === 'new_extreme' ? '🔥 New Extreme Won' : (winner === 'old_450ms' ? '❌ 450ms Won' : '🤝 Draw');
    console.log(
      `Game ${String(i + 1).padStart(2)}: New as ${seatLabel.padEnd(11)} | ` +
      `Score: ${String(newScore).padStart(2)} vs ${String(oldScore).padStart(2)} (${game.state.round_num} rds) | ` +
      `${winLabel}`
    );
  }

  console.log(`\n=======================================================`);
  console.log(`  NEW EXTREME VS 450MS RESULTS (${totalGames} GAMES)`);
  console.log(`=======================================================`);
  console.log(`New Extreme: 100% win rate or massive score diff?`);
  console.log(`New Extreme: ${newWins} Wins (${((newWins / totalGames) * 100).toFixed(1)}%)`);
  console.log(`450ms:       ${oldWins} Wins (${((oldWins / totalGames) * 100).toFixed(1)}%)`);
  console.log(`Draws:       ${draws} (${((draws / totalGames) * 100).toFixed(1)}%)`);
  console.log(`-------------------------------------------------------`);
  console.log(`Average Score: New ${(newTotalScore / totalGames).toFixed(1)} vs 450ms ${(oldTotalScore / totalGames).toFixed(1)} (Diff: ${((newTotalScore - oldTotalScore) / totalGames).toFixed(2)})`);
  console.log(`=======================================================\n`);
}

runMatch(10).catch(console.error);
