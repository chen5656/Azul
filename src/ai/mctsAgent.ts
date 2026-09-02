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
import { rngForPosition } from './position';
import { DEFAULT_WEIGHTS, type Weights, evaluate } from './evaluate';
import { actionValue } from './greedyAgent';

/**
 * Evaluation units are roughly "points"; this squashes a plausible swing into
 * [-1, 1] without saturating on ordinary positions.
 */
export const VALUE_SCALE = 25.0;

/**
 * How much of a terminal reward the final margin is allowed to move it.
 *
 * Pure win/loss makes the search indifferent between +1 and +50, so once a line
 * is winning it wanders. Adding a bounded margin term orders wins by how big
 * they are; keeping the term below 1 keeps the ordering lexicographic — the
 * narrowest win (>= 1 - MARGIN_BONUS) still beats the widest loss.
 */
export const MARGIN_BONUS = 0.15;

/** Point difference at which the margin term is most of the way to saturated. */
export const MARGIN_SCALE = 30.0;

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
  /**
   * Fixes the simulations per move, overriding the work budget.
   *
   * Only the bench and the tests want this: a flat count makes the cost per
   * move swing by a factor of thirty across positions (see `./budget`), which
   * is why the level itself budgets work instead. Either way it is a count and
   * not a stopwatch, so the opponent never depends on the machine.
   */
  simulations?: number;
  /** Overrides the by-round work budget; for calibration and tests. */
  stepBudget?: number;
  /**
   * Multiplies the by-round work budget, keeping its shape.
   *
   * The bench uses this to find the budget a strength target needs: the level's
   * cost cannot be calibrated with a stopwatch (that is the whole point of a
   * work budget), so its size is chosen by playing it, not by timing it.
   */
  stepScale?: number;
  /**
   * Milliseconds after which the search gives up mid-budget, to keep a pathological
   * device from hanging the game. Normal hardware never reaches it; when it does,
   * `cappedOut` is set so the caller can tell that this move was short-changed.
   */
  safetyCapMs?: number;
  exploration?: number;
  treeWidth?: number;
  rolloutEpsilon?: number;
  rolloutWidth?: number;
  rolloutRounds?: number;
  /** 0 disables margin awareness and restores pure win/loss rewards. */
  marginBonus?: number;
  weights?: Weights;
}

export class MctsAgent implements Agent {
  readonly level = 'extreme' as const;
  /** Simulations actually run on the last `choose`. */
  simulations = 0;
  /** Engine operations spent on the last `choose` — the budget's real unit. */
  steps = 0;
  /** True when the last `choose` hit the safety cap before spending its budget. */
  cappedOut = false;

  /** Base seed; `rng` is rebuilt from it and the position on every `choose`. */
  private readonly seed: number;
  private rng: Rng;
  /** A fixed override, or null to follow the by-round schedule. */
  private readonly simulationBudget: number | null;
  /** A fixed work budget, or null to follow the by-round schedule. */
  private readonly stepBudgetOverride: number | null;
  private readonly stepScale: number;
  private readonly safetyCapMs: number;
  private readonly exploration: number;
  private readonly treeWidth: number;
  private readonly rolloutEpsilon: number;
  private readonly rolloutWidth: number;
  private readonly rolloutRounds: number;
  private readonly marginBonus: number;
  private readonly weights: Weights;
  private rootPlayer = 0;

  constructor(options: MctsOptions = {}) {
    this.seed = options.seed ?? new Rng().nextInt(2 ** 31);
    this.rng = new Rng(this.seed);
    this.simulationBudget = options.simulations ?? null;
    this.stepBudgetOverride = options.stepBudget ?? null;
    this.stepScale = options.stepScale ?? 1;
    this.safetyCapMs = options.safetyCapMs ?? AI_SAFETY_CAP_MS;
    this.exploration = options.exploration ?? 1.2;
    this.treeWidth = options.treeWidth ?? 12;
    this.rolloutEpsilon = options.rolloutEpsilon ?? 0.15;
    this.rolloutWidth = options.rolloutWidth ?? 6;
    this.rolloutRounds = options.rolloutRounds ?? 2;
    this.marginBonus = options.marginBonus ?? MARGIN_BONUS;
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

  /**
   * Terminal games score ±1 nudged by the final margin; cut-off positions use a
   * squashed evaluation. The nudge never crosses zero, so winning always
   * outranks losing and the margin only orders same-result outcomes.
   */
  private reward(state: GameState): number {
    if (state.phase === GAME_OVER) {
      const me = this.rootPlayer;
      const mine = state.players[me].score;
      const theirs = state.players[1 - me].score;
      const margin = this.marginBonus * Math.tanh((mine - theirs) / MARGIN_SCALE);
      if (mine !== theirs) return (mine > theirs ? 1 : -1) + margin;
      const myRows = state.players[me].completeRows();
      const theirRows = state.players[1 - me].completeRows();
      if (myRows !== theirRows) return myRows > theirRows ? 1 : -1;
      return 0;
    }
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
    const actions = legalActions(state);
    if (!actions.length) throw new AgentError('no legal action available');
    if (actions.length === 1) return actions[0];

    this.rootPlayer = player;
    // Every determinization this search draws comes from the position, so the
    // same position always gets the same answer — however many searches this
    // agent has run, and whatever their budgets were.
    this.rng = rngForPosition(this.seed, state, player);
    const root = new Node(player);
    const stepBudget =
      this.stepBudgetOverride ?? Math.round(extremeSteps(state.round_num) * this.stepScale);
    const deadline = now() + this.safetyCapMs;
    this.simulations = 0;
    this.steps = 0;
    this.cappedOut = false;

    while (
      this.simulationBudget === null ? this.steps < stepBudget : this.simulations < this.simulationBudget
    ) {
      // The budget is measured in work, not seconds; the clock is only a
      // stop-loss. Checking it every 16 keeps `now()` off the hot path.
      if ((this.simulations & 15) === 0 && now() > deadline) {
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
    // Equal visits are common at this budget; break those on mean value so the
    // tie goes to the higher-scoring line rather than to map order.
    let best: Action | null = null;
    let bestVisits = -1;
    let bestMean = -Infinity;
    for (const action of actions) {
      const child = root.children.get(action.actionId);
      if (!child) continue;
      const mean = child.visits ? child.value / child.visits : -Infinity;
      if (child.visits > bestVisits || (child.visits === bestVisits && mean > bestMean)) {
        best = action;
        bestVisits = child.visits;
        bestMean = mean;
      }
    }
    // A cap tripped before the first simulation still yields a legal move.
    return best ?? choice(this.rng, actions);
  }
}
