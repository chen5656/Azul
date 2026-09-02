/**
 * Talks to the AI worker, and survives without it.
 *
 * The worker chunk is imported lazily so it is fetched before the first AI turn
 * rather than on page load (NFR-002). If the worker cannot be created, or a
 * request fails, the client falls back to searching on the main thread and says
 * so — the game always completes (AC-037), it just gets less responsive.
 */

import { Action, type GameState, legalActions } from '../engine';
import { type Agent, type AgentBudget, type AgentLevel, makeAgent } from '../ai';
import type { AiRequest, AiResponse } from '../workers/ai.worker';

export interface AiSpec {
  level: AgentLevel;
  seed?: number;
  /** Overrides for how much work the level may do; the defaults are the game's. */
  budget?: AgentBudget;
}

export type AiMode = 'worker' | 'main-thread';

/**
 * Thrown into pending `choose` calls when the client is disposed — a restart,
 * or React remounting the session. The caller drops the reply; it is not an
 * error the player should ever see.
 */
export class AiDisposed extends Error {}

export interface AiMove {
  action: Action;
  elapsedMs: number;
  mode: AiMode;
  /** True when the move came from a search started before it was asked for. */
  prefetched?: boolean;
  /**
   * True when the search hit its safety cap and answered with less work than
   * the level calls for — this device is slower than any the levels are sized
   * for, and the opponent it faced was correspondingly weaker.
   */
  capped?: boolean;
  simulations?: number;
  steps?: number;
}

const CALIBRATION_LOG_KEY = 'azul:mcts-calibration:v1';

interface MctsCalibrationEntry {
  recordedAt: string;
  round: number;
  legalActions: number;
  elapsedMs: number;
  simulations: number;
  steps: number;
  actionId: number;
  mode: AiMode;
  prefetched: boolean;
}

export class AiClient {
  private worker: Worker | null = null;
  private fallbackAgent: Agent | null = null;
  private nextId = 1;
  private initialized = false;
  /** Rejectors for in-flight requests, so `dispose` never strands a promise. */
  private readonly pending = new Map<number, (reason: Error) => void>();
  /**
   * A search started before anyone asked for it — see `prefetch`. Keyed by the
   * question it answers, so a mismatched one is dropped rather than misapplied.
   */
  private speculative: { key: string; promise: Promise<AiMove> } | null = null;
  /** The safety-cap warning is worth saying once, not once per move. */
  private warnedCapped = false;
  /** Flips to 'main-thread' permanently once the worker has let us down. */
  mode: AiMode = 'worker';

  constructor(private readonly spec: AiSpec) {}

  /** Create the worker if we do not have one yet. Returns null if unavailable. */
  private ensureWorker(): Worker | null {
    if (this.mode === 'main-thread') return null;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.addEventListener('error', () => this.demote());
      return this.worker;
    } catch {
      this.demote();
      return null;
    }
  }

  private demote(): void {
    this.mode = 'main-thread';
    this.initialized = false;
    this.speculative = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private onMainThread(state: GameState, player: number): AiMove {
    if (!this.fallbackAgent) {
      this.fallbackAgent = makeAgent(this.spec.level, this.spec.seed, this.spec.budget);
    }
    const started = performance.now();
    const action = this.fallbackAgent.choose(state, player);
    const move: AiMove = {
      action,
      elapsedMs: performance.now() - started,
      mode: 'main-thread',
      capped: this.fallbackAgent.cappedOut === true,
      simulations: this.fallbackAgent.simulations,
      steps: this.fallbackAgent.steps,
    };
    this.recordCalibration(state, move);
    this.warnIfCapped(move);
    return move;
  }

  /**
   * Start searching a position the AI is certain to be asked about next.
   *
   * The opponent's thinking is otherwise dead time bracketed by animations: the
   * player's tile flies home, *then* the search runs, *then* the reply animates.
   * Because the AI's question is fully determined the moment the player commits
   * a move, the search can run underneath the player's own placement animation
   * instead — on a quick device it is finished before the animation is, and on a
   * slow one the animation still pays for a second of it. That is what makes a
   * fixed, device-independent work budget affordable (see `src/ai/budget.ts`).
   *
   * Only ever called with the exact position `choose` will be handed, so no
   * search is wasted and the agent's own RNG stays on the same sequence it would
   * have followed without prefetching. A miss is safe regardless — the key check
   * drops the answer and `choose` searches again.
   */
  prefetch(state: GameState, player: number): void {
    // On the main thread this would freeze the very animation it means to hide
    // behind, so the fallback path just waits its turn as before.
    if (this.mode !== 'worker' || this.speculative) return;
    const key = this.keyFor(state, player);
    const promise = this.choose(state, player, true);
    // Nothing awaits this yet; a rejection here must not surface as unhandled.
    promise.catch(() => undefined);
    this.speculative = { key, promise };
  }

  private keyFor(state: GameState, player: number): string {
    return `${player}:${JSON.stringify(state.toDict(true))}`;
  }

  /** Ask for a move. Never rejects for worker reasons — it falls back instead. */
  async choose(state: GameState, player: number, speculative = false): Promise<AiMove> {
    if (!speculative && this.speculative) {
      const pending = this.speculative;
      this.speculative = null;
      if (pending.key === this.keyFor(state, player)) {
        const move = await pending.promise;
        const prefetched = { ...move, prefetched: true };
        this.recordCalibration(state, prefetched);
        return prefetched;
      }
      // A different question than the one in flight: let that search finish and
      // be discarded, and ask the real one behind it.
    }

    const worker = this.ensureWorker();
    if (!worker) return this.onMainThread(state, player);

    const id = this.nextId++;
    const request: AiRequest = {
      id,
      init: this.initialized ? undefined : this.spec,
      state: state.toDict(true),
      player,
    };

    try {
      const response = await new Promise<AiResponse>((resolve, reject) => {
        const onMessage = (event: MessageEvent<AiResponse>) => {
          if (event.data.id !== id) return;
          cleanup();
          resolve(event.data);
        };
        const onError = () => {
          cleanup();
          reject(new Error('the AI worker failed'));
        };
        const cleanup = () => {
          this.pending.delete(id);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        this.pending.set(id, (reason) => {
          cleanup();
          reject(reason);
        });
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage(request);
      });

      if (!response.ok) throw new Error(response.error);
      this.initialized = true;
      const move: AiMove = {
        action: Action.fromId(response.actionId),
        elapsedMs: response.elapsedMs,
        mode: 'worker',
        capped: response.capped,
        simulations: response.simulations,
        steps: response.steps,
      };
      if (!speculative) this.recordCalibration(state, move);
      this.warnIfCapped(move);
      return move;
    } catch (err) {
      if (err instanceof AiDisposed) throw err; // the caller is going away
      // A worker that dies mid-game hands the rest of the game to this thread.
      this.demote();
      return this.onMainThread(state, player);
    }
  }

  /**
   * Say so, once, if this device is slow enough that the safety cap is biting.
   *
   * It should never fire: the levels are sized so that even a device several
   * times slower than the bench machine finishes their work. If it does fire,
   * the player is quietly facing a weaker opponent than the level promises, and
   * that is worth knowing about rather than swallowing.
   */
  private warnIfCapped(move: AiMove): void {
    if (!move.capped || this.warnedCapped) return;
    this.warnedCapped = true;
    console.warn(
      `AI search hit its safety cap after ${move.elapsedMs.toFixed(0)}ms; ` +
        `the ${this.spec.level} opponent is playing below strength on this device.`,
    );
  }

  /** Persist one JSON record per manually played Extreme move for calibration. */
  private recordCalibration(state: GameState, move: AiMove): void {
    if (this.spec.level !== 'extreme' || move.simulations === undefined || move.steps === undefined) {
      return;
    }
    const entry: MctsCalibrationEntry = {
      recordedAt: new Date().toISOString(),
      round: state.round_num,
      legalActions: legalActions(state).length,
      elapsedMs: Number(move.elapsedMs.toFixed(3)),
      simulations: move.simulations,
      steps: move.steps,
      actionId: move.action.actionId,
      mode: move.mode,
      prefetched: move.prefetched === true,
    };
    console.info('[MCTS calibration]', JSON.stringify(entry));
    try {
      const previous = JSON.parse(localStorage.getItem(CALIBRATION_LOG_KEY) ?? '[]');
      const log = Array.isArray(previous) ? previous : [];
      log.push(entry);
      localStorage.setItem(CALIBRATION_LOG_KEY, JSON.stringify(log.slice(-1000)));
    } catch {
      // Console logging remains available when storage is blocked or full.
    }
  }

  dispose(): void {
    this.speculative = null;
    for (const reject of this.pending.values()) reject(new AiDisposed('AI client disposed'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }
}
