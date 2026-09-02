/**
 * The `extreme` level — open-loop determinized UCT.
 *
 * Chance only enters at a round boundary (the deal), and the bag's composition
 * is public — only the draw order is random. So instead of building a node per
 * possible deal, each simulation draws its own deal when it crosses a boundary
 * and the statistics for different deals aggregate on the same node (open loop).
 * That keeps the tree small and is why ISMCTS is not needed here.
 *
 * Because deals differ between simulations, the set of legal actions at a node
 * differs too; selection always intersects the node's children with the actions
 * that are actually legal in *this* simulation.
 */

import {
  type Action,
  GAME_OVER,
  type GameState,
  Rng,
  applyAction,
  legalActions,
  settleAndDeal,
} from '../engine';
import { type Agent, AgentError, choice, sample } from './base';
import { AI_SAFETY_CAP_MS, extremeSteps } from './budget';
import { now } from './clock';
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';
import { actionValue } from './greedyAgent';

/**
 * Evaluation units are roughly "points"; this squashes a plausible swing into
 * [-1, 1] without saturating on ordinary positions.
 */
export const VALUE_SCALE = 25.0;

/** Terminal score margin may refine, but never reverse, one playout's result. */
export const SCORE_MARGIN_BONUS = 0.1;
export const SCORE_MARGIN_SCALE = 30.0;

/**
 * Prefer wins first, then prefer larger winning margins and narrower losses.
 * The bounded bonus keeps every simulated win positive and every loss negative.
 */
export function terminalReward(state: GameState, player: number): number {
  const mine = state.players[player].score;
  const theirs = state.players[1 - player].score;
  const margin = SCORE_MARGIN_BONUS * Math.tanh((mine - theirs) / SCORE_MARGIN_SCALE);
  if (mine !== theirs) return (mine > theirs ? 1 : -1) + margin;
  const myRows = state.players[player].completeRows();
  const theirRows = state.players[1 - player].completeRows();
  if (myRows !== theirRows) return myRows > theirRows ? 1 : -1;
  return 0;
}

class Node {
  visits = 0;
  /** summed reward from the root player's view */
  value = 0;
  children = new Map<number, Node>();
  /** action ids worth searching, computed once per node */
  candidates: number[] | null = null;

  constructor(readonly player: number) {} // side to move here
}

export interface MctsOptions {
  seed?: number;
  /** Calibration override in seconds; production uses measured fixed work. */
  timeBudget?: number;
  /** Compatibility alias used by deterministic tests and benchmarks. */
  simulations?: number;
  /** Stop-loss for fixed-work searches, in milliseconds. */
  safetyCapMs?: number;
  /** Fixed engine-work override used by tests and calibration. */
  stepBudget?: number;
  /** Multiplies the measured per-round work schedule. */
  stepScale?: number;
  exploration?: number;
  treeWidth?: number;
  rolloutEpsilon?: number;
  rolloutWidth?: number;
  rolloutRounds?: number;
  maxSimulations?: number;
  weights?: Weights;
}

export class MctsAgent implements Agent {
  readonly level = 'extreme' as const;
  simulations = 0;
  /** Engine operations performed by the last search. Calibration only. */
  steps = 0;
  cappedOut = false;

  private readonly rng: Rng;
  private readonly timeBudget: number;
  private readonly useClockBudget: boolean;
  private readonly stepBudget: number | null;
  private readonly stepScale: number;
  private readonly safetyCapMs: number;
  private readonly exploration: number;
  private readonly treeWidth: number;
  private readonly rolloutEpsilon: number;
  private readonly rolloutWidth: number;
  private readonly rolloutRounds: number;
  private readonly maxSimulations: number | null;
  private readonly weights: Weights;
  private rootPlayer = 0;

  constructor(options: MctsOptions = {}) {
    this.rng = new Rng(options.seed);
    this.timeBudget = options.timeBudget ?? 0.45;
    this.useClockBudget = options.timeBudget !== undefined;
    this.stepBudget = options.stepBudget ?? null;
    this.stepScale = options.stepScale ?? 1;
    this.safetyCapMs = options.safetyCapMs ?? AI_SAFETY_CAP_MS;
    this.exploration = options.exploration ?? 1.2;
    this.treeWidth = options.treeWidth ?? 12;
    this.rolloutEpsilon = options.rolloutEpsilon ?? 0.15;
    this.rolloutWidth = options.rolloutWidth ?? 6;
    this.rolloutRounds = options.rolloutRounds ?? 2;
    this.maxSimulations = options.maxSimulations ?? options.simulations ?? null;
    this.weights = options.weights ?? DEFAULT_WEIGHTS;
  }

  // ---- one simulation ----------------------------------------------

  /**
   * Narrow a 30-80 move node to the moves a shallow look says are plausible.
   *
   * At a 450ms budget a full-width tree gives every root child two or three
   * visits, which is noise. The shortlist is computed once per node and then
   * filtered against what is legal in the current simulation, which is all that
   * can change once a playout crosses a round boundary.
   */
  private candidates(node: Node, state: GameState, actions: Action[]): Action[] {
    if (node.candidates === null) {
      const mover = state.current;
      const ranked = actions
        .map((a) => [actionValue(state, a, mover, this.weights), a] as const)
        .sort((x, y) => y[0] - x[0])
        .map(([, a]) => a);
      node.candidates = ranked.slice(0, this.treeWidth).map((a) => a.actionId);
    }
    const shortlist = new Set(node.candidates);
    const narrowed = actions.filter((a) => shortlist.has(a.actionId));
    return narrowed.length ? narrowed : actions;
  }

  /** UCT over the actions legal in this simulation; unseen ones go first. */
  private select(node: Node, actions: Action[]): Action {
    const unseen = actions.filter((a) => !node.children.has(a.actionId));
    if (unseen.length) return choice(this.rng, unseen);

    const logN = Math.log(node.visits + 1);
    let best: Action | null = null;
    let bestScore = -Infinity;
    for (const action of actions) {
      const child = node.children.get(action.actionId)!;
      let exploit = child.visits ? child.value / child.visits : 0;
      if (node.player !== this.rootPlayer) exploit = -exploit;
      const score = exploit + this.exploration * Math.sqrt(logN / (child.visits + 1e-9));
      if (score > bestScore) {
        best = action;
        bestScore = score;
      }
    }
    return best as Action;
  }

  /** Terminal games score ±1; cut-off positions use a squashed evaluation. */
  private reward(state: GameState): number {
    if (state.phase === GAME_OVER) return terminalReward(state, this.rootPlayer);
    return Math.tanh(evaluate(state, this.rootPlayer, this.weights) / VALUE_SCALE);
  }

  /** Greedy-with-noise to the end, or `budget` round boundaries, whichever first. */
  private playout(state: GameState, budget: number): number {
    while (state.phase !== GAME_OVER && budget > 0) {
      if (state.draftingDone()) {
        settleAndDeal(state);
        this.steps += 1;
        budget -= 1;
        continue;
      }
      applyAction(state, this.rolloutAction(state));
      this.steps += 1;
    }
    if (state.phase !== GAME_OVER && state.draftingDone()) settleAndDeal(state);
    return this.reward(state);
  }

  /**
   * Greedy over a random sample of moves — full greedy costs more than the extra
   * playout accuracy is worth at this budget.
   */
  private rolloutAction(state: GameState): Action {
    let actions = legalActions(state);
    if (this.rng.next() < this.rolloutEpsilon) return choice(this.rng, actions);
    if (actions.length > this.rolloutWidth) {
      actions = sample(this.rng, actions, this.rolloutWidth);
    }
    const mover = state.current;
    let best = actions[0];
    let bestValue = actionValue(state, best, mover, this.weights);
    for (let i = 1; i < actions.length; i += 1) {
      const value = actionValue(state, actions[i], mover, this.weights);
      if (value > bestValue) {
        best = actions[i];
        bestValue = value;
      }
    }
    return best;
  }

  private simulate(root: Node, state: GameState): void {
    let node = root;
    const path = [root];
    let roundsLeft = this.rolloutRounds;
    let reward: number;

    for (;;) {
      if (state.phase === GAME_OVER) {
        reward = this.reward(state);
        break;
      }
      if (state.draftingDone()) {
        if (roundsLeft <= 0) {
          reward = this.reward(state);
          break;
        }
        settleAndDeal(state);
        this.steps += 1;
        roundsLeft -= 1;
        continue;
      }

      const actions = this.candidates(node, state, legalActions(state));
      const expanding = actions.some((a) => !node.children.has(a.actionId));
      const action = this.select(node, actions);
      let child = node.children.get(action.actionId);
      if (child === undefined) {
        child = new Node(1 - state.current);
        node.children.set(action.actionId, child);
      }
      applyAction(state, action);
      this.steps += 1;
      node = child;
      path.push(child);
      if (expanding) {
        reward = this.playout(state, roundsLeft);
        break;
      }
    }

    for (const visited of path) {
      visited.visits += 1;
      visited.value += reward;
    }
  }

  // ---- agent API ----------------------------------------------------

  choose(state: GameState, player: number): Action {
    this.simulations = 0;
    this.steps = 0;
    this.cappedOut = false;
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    if (actions.length === 1) return actions[0];

    this.rootPlayer = player;
    const root = new Node(player);
    const useClockBudget = this.useClockBudget;
    const deadline = now() + (useClockBudget ? this.timeBudget * 1000 : this.safetyCapMs);
    const targetSteps =
      this.stepBudget ?? Math.round(extremeSteps(state.round_num) * this.stepScale);

    while (useClockBudget ? now() < deadline : this.steps < targetSteps) {
      if (this.maxSimulations !== null && this.simulations >= this.maxSimulations) break;
      if (!useClockBudget && (this.simulations & 15) === 0 && now() >= deadline) {
        this.cappedOut = true;
        break;
      }
      const scratch = state.clone();
      // Each simulation deals its own future: an independent determinization.
      scratch.rng = new Rng(this.rng.nextInt(2 ** 31));
      this.simulate(root, scratch);
      this.simulations += 1;
    }

    // Robust child: most visited, not highest mean — it is far less noisy.
    let best: Action | null = null;
    let bestVisits = -1;
    for (const action of actions) {
      const child = root.children.get(action.actionId);
      if (child && child.visits > bestVisits) {
        best = action;
        bestVisits = child.visits;
      }
    }
    // An expired budget before the first simulation still yields a legal move.
    return best ?? choice(this.rng, actions);
  }
}
