/**
 * Expert level hybrid agent (Scheme A).
 *
 * Combines 4-ply Minimax alpha-beta search with a transparent, human-predictable
 * rule priority filter:
 *
 * 1. Calculate deep value for all legal actions via Minimax (depth 4).
 * 2. Form a competitive candidate pool (moves within a competitive score window of the optimum).
 * 3. Filter through explicit, human-predictable priority rules:
 *    - Priority Tier 1: Immediate Endgame Bonus Completion (Color all 5 > Column > Row).
 *    - Priority Tier 2: Immediately Completes a Staging Row (Row 5 > Row 4 > Row 3 > Row 2 > Row 1).
 *      * NOTE: ONLY applies when the row ACTUALLY completes (reaches 100% capacity) this round!
 *    - Priority Tier 3: Grabbing the First-Player Token (takes token without heavy penalty).
 *    - Priority Tier 4: Highest Minimax value.
 * 4. Stochastic Ties: When multiple candidate actions share the top tier and score,
 *    randomly select using rngForPosition(seed, state, player).
 */

import {
  type Action,
  GRID_COL,
  GRID_SIZE,
  NUM_ROWS,
  PENALTY_DEST,
  type GameState,
  type PlayerBoard,
  Rng,
  applyAction,
  legalActions,
  preview,
  settleRound,
  undoAction,
} from '../engine';
import { type Agent, type AgentLevel, AgentError, choice } from './base';
import { AI_SAFETY_CAP_MS } from './budget';
import { now } from './clock';
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';
import { actionValue } from './greedyAgent';
import { rngForPosition } from './position';

const INF = Infinity;

class SearchCapped extends Error {}

interface TTEntry {
  depth: number;
  value: number;
  flag: number;
  bestActionId?: number;
}

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

function stateKey(state: GameState): string {
  let k = `${state.current}|`;
  for (let i = 0; i < 5; i += 1) {
    const d = state.displays[i];
    k += `${d[0]},${d[1]},${d[2]},${d[3]},${d[4]};`;
  }
  const c = state.center;
  k += `|${state.center_has_token ? 1 : 0}|${c[0]},${c[1]},${c[2]},${c[3]},${c[4]}|`;
  for (let p = 0; p < 2; p += 1) {
    const b = state.players[p];
    k += `${b.staging_colors.join(',')};${b.staging_counts.join(',')};${b.penalty_tiles.length};${b.has_first_token ? 1 : 0}|`;
  }
  return k;
}

function simulatedSettledGrid(board: PlayerBoard): boolean[][] {
  const grid = board.grid.map((row) => row.slice());
  for (let r = 0; r < NUM_ROWS; r += 1) {
    if (board.staging_counts[r] === r + 1) {
      const col = GRID_COL[r][board.staging_colors[r]];
      grid[r][col] = true;
    }
  }
  return grid;
}

interface ActionProperties {
  action: Action;
  minimaxValue: number;
  completesBonusColor: boolean;
  completesBonusColumn: boolean;
  completesBonusRow: boolean;
  completedStagingRow: number; // 0..4 if row completes to 100%, else -1
  takesFirstToken: boolean;
  penaltyDelta: number;
}

export class ExpertRuleAgent implements Agent {
  readonly level: AgentLevel = 'expert';
  nodes = 0;
  reachedDepth = 0;
  cappedOut = false;

  private readonly seed: number;
  private readonly depth = 4;
  private readonly safetyCapMs: number;
  private readonly weights: Weights = DEFAULT_WEIGHTS;
  private deadline = Infinity;
  private readonly tt = new Map<string, TTEntry>();

  constructor(seed?: number, safetyCapMs = AI_SAFETY_CAP_MS) {
    this.seed = seed ?? new Rng().nextInt(2 ** 31);
    this.safetyCapMs = safetyCapMs;
  }

  private ordered(state: GameState, ttActionId?: number): Action[] {
    const mover = state.current;
    const scored = legalActions(state).map(
      (a) => [a.actionId === ttActionId ? Infinity : actionValue(state, a, mover, this.weights), a] as const,
    );
    scored.sort((x, y) => y[0] - x[0]);
    return scored.map(([, a]) => a);
  }

  private leaf(state: GameState, player: number): number {
    const scratch = state.clone();
    settleRound(scratch);
    return evaluate(scratch, player, this.weights);
  }

  private search(
    state: GameState,
    player: number,
    depth: number,
    alpha: number,
    beta: number,
  ): number {
    if (now() > this.deadline) throw new SearchCapped();
    this.nodes += 1;

    if (state.draftingDone()) return this.leaf(state, player);
    if (depth === 0) return evaluate(state, player, this.weights);

    const key = stateKey(state);
    const entry = this.tt.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return entry.value;
      if (entry.flag === TT_LOWER && entry.value >= beta) return entry.value;
      if (entry.flag === TT_UPPER && entry.value <= alpha) return entry.value;
    }

    const origAlpha = alpha;
    const maximizing = state.current === player;
    let best = maximizing ? -INF : INF;
    let bestAction: Action | null = null;
    const actions = this.ordered(state, entry?.bestActionId);

    for (const action of actions) {
      const undo = applyAction(state, action);
      let value: number;
      try {
        value = this.search(state, player, depth - 1, alpha, beta);
      } finally {
        undoAction(state, undo);
      }
      if (maximizing) {
        if (value > best) {
          best = value;
          bestAction = action;
        }
        if (best > alpha) alpha = best;
      } else {
        if (value < best) {
          best = value;
          bestAction = action;
        }
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }

    let flag = TT_EXACT;
    if (best <= origAlpha) flag = TT_UPPER;
    else if (best >= beta) flag = TT_LOWER;
    this.tt.set(key, { depth, value: best, flag, bestActionId: bestAction?.actionId });

    return best;
  }

  private evaluateRoot(
    state: GameState,
    player: number,
    depth: number,
    ordering: Action[],
  ): [number, Action][] {
    let alpha = -INF;
    const values: [number, Action][] = [];

    for (const action of ordering) {
      const undo = applyAction(state, action);
      let value: number;
      try {
        value = this.search(state, player, depth - 1, alpha, INF);
      } finally {
        undoAction(state, undo);
      }
      values.push([value, action]);
      if (value > alpha) alpha = value;
    }
    return values;
  }

  private analyzeActionProperties(
    state: GameState,
    action: Action,
    player: number,
    minimaxValue: number,
  ): ActionProperties {
    const board = state.players[player];
    const prev = preview(state, action);
    const penaltyDelta = prev.penalty_after - prev.penalty_before;
    const takesFirstToken = prev.takes_token;

    let completesBonusColor = false;
    let completesBonusColumn = false;
    let completesBonusRow = false;
    let completedStagingRow = -1;

    const undo = applyAction(state, action);
    try {
      const newBoard = state.players[player];
      if (action.dest !== PENALTY_DEST) {
        // ONLY if it actually completes to capacity this round!
        if (newBoard.staging_counts[action.dest] === action.dest + 1) {
          completedStagingRow = action.dest;
        }
      }

      if (completedStagingRow !== -1) {
        const oldGrid = board.grid;
        const newGrid = simulatedSettledGrid(newBoard);
        const settledCol = GRID_COL[completedStagingRow][action.color];

        let colCountBefore = 0;
        let colCountAfter = 0;
        for (let r = 0; r < NUM_ROWS; r += 1) {
          if (oldGrid[r][settledCol]) colCountBefore += 1;
          if (newGrid[r][settledCol]) colCountAfter += 1;
        }
        if (colCountBefore < NUM_ROWS && colCountAfter === NUM_ROWS) {
          completesBonusColumn = true;
        }

        let rowCountBefore = 0;
        let rowCountAfter = 0;
        for (let c = 0; c < GRID_SIZE; c += 1) {
          if (oldGrid[completedStagingRow][c]) rowCountBefore += 1;
          if (newGrid[completedStagingRow][c]) rowCountAfter += 1;
        }
        if (rowCountBefore < GRID_SIZE && rowCountAfter === GRID_SIZE) {
          completesBonusRow = true;
        }

        let colorCountBefore = 0;
        let colorCountAfter = 0;
        for (let r = 0; r < NUM_ROWS; r += 1) {
          const c = GRID_COL[r][action.color];
          if (oldGrid[r][c]) colorCountBefore += 1;
          if (newGrid[r][c]) colorCountAfter += 1;
        }
        if (colorCountBefore < NUM_ROWS && colorCountAfter === NUM_ROWS) {
          completesBonusColor = true;
        }
      }
    } finally {
      undoAction(state, undo);
    }

    return {
      action,
      minimaxValue,
      completesBonusColor,
      completesBonusColumn,
      completesBonusRow,
      completedStagingRow,
      takesFirstToken,
      penaltyDelta,
    };
  }

  choose(state: GameState, player: number): Action {
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    if (actions.length === 1) return actions[0];

    this.deadline = now() + this.safetyCapMs;
    this.nodes = 0;
    this.cappedOut = false;
    this.tt.clear();
    const scratch = state.clone();

    let ordering = this.ordered(scratch);
    let rootValues: [number, Action][] = ordering.map((a) => [actionValue(scratch, a, player, this.weights), a]);
    this.reachedDepth = 1;

    for (let depth = 2; depth <= this.depth; depth += 1) {
      let values: [number, Action][];
      try {
        values = this.evaluateRoot(scratch, player, depth, ordering);
      } catch (err) {
        if (err instanceof SearchCapped) {
          this.cappedOut = true;
          break;
        }
        throw err;
      }
      rootValues = values;
      this.reachedDepth = depth;
      values.sort((x, y) => y[0] - x[0]);
      ordering = values.map(([, a]) => a);
    }

    // Sort by minimax value descending
    rootValues.sort((x, y) => y[0] - x[0]);
    const maxVal = rootValues[0][0];

    // Form competitive candidate pool: moves within tolerance of optimal (to prevent strategic blunders)
    const SCORE_WINDOW = 2.0;
    const competitiveMoves = rootValues.filter(([val]) => val >= maxVal - SCORE_WINDOW);

    const analyzed = competitiveMoves.map(([val, act]) =>
      this.analyzeActionProperties(scratch, act, player, val),
    );

    // Apply strict rule filters in order:

    // 1. Immediate Endgame Bonus Completion (Color > Column > Row)
    const bonusColor = analyzed.filter((a) => a.completesBonusColor);
    if (bonusColor.length > 0) return this.stochasticTieBreak(state, player, bonusColor);

    const bonusCol = analyzed.filter((a) => a.completesBonusColumn);
    if (bonusCol.length > 0) return this.stochasticTieBreak(state, player, bonusCol);

    const bonusRow = analyzed.filter((a) => a.completesBonusRow);
    if (bonusRow.length > 0) return this.stochasticTieBreak(state, player, bonusRow);

    // 2. Immediately Completes a Staging Row (5 > 4 > 3 > 2 > 1)
    // ONLY when completedStagingRow !== -1 (row is filled to 100%)!
    for (let targetRow = 4; targetRow >= 0; targetRow -= 1) {
      const completed = analyzed.filter((a) => a.completedStagingRow === targetRow);
      if (completed.length > 0) {
        return this.stochasticTieBreak(state, player, completed);
      }
    }

    // 3. Grabbing First-Player Token (without heavy penalty)
    const tokenMoves = analyzed.filter((a) => a.takesFirstToken && a.penaltyDelta >= -2);
    if (tokenMoves.length > 0) {
      return this.stochasticTieBreak(state, player, tokenMoves);
    }

    // 4. Default: Highest minimax value within the pool
    return this.stochasticTieBreak(state, player, analyzed);
  }

  private stochasticTieBreak(state: GameState, player: number, candidates: ActionProperties[]): Action {
    if (candidates.length === 1) return candidates[0].action;

    // Pick top tier of minimaxValue among these candidates
    let bestVal = -Infinity;
    for (const c of candidates) {
      if (c.minimaxValue > bestVal) bestVal = c.minimaxValue;
    }

    const EPS = 0.2;
    const bestTies = candidates.filter((c) => Math.abs(c.minimaxValue - bestVal) < EPS);

    if (bestTies.length === 1) return bestTies[0].action;

    const rng = rngForPosition(this.seed, state, player);
    return choice(rng, bestTies.map((c) => c.action));
  }
}
