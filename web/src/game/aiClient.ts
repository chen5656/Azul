/**
 * Talks to the AI worker, and survives without it.
 *
 * The worker chunk is imported lazily so it is fetched before the first AI turn
 * rather than on page load (NFR-002). If the worker cannot be created, or a
 * request fails, the client falls back to searching on the main thread and says
 * so — the game always completes (AC-037), it just gets less responsive.
 */

import { Action, type GameState } from '../engine';
import { type Agent, type AgentLevel, makeAgent } from '../ai';
import type { AiRequest, AiResponse } from '../workers/ai.worker';

export interface AiSpec {
  level: AgentLevel;
  seed?: number;
  /** seconds */
  timeBudget?: number;
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
}

export class AiClient {
  private worker: Worker | null = null;
  private fallbackAgent: Agent | null = null;
  private nextId = 1;
  private initialized = false;
  /** Rejectors for in-flight requests, so `dispose` never strands a promise. */
  private readonly pending = new Map<number, (reason: Error) => void>();
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
    this.worker?.terminate();
    this.worker = null;
  }

  private onMainThread(state: GameState, player: number): AiMove {
    if (!this.fallbackAgent) {
      this.fallbackAgent = makeAgent(this.spec.level, this.spec.seed, this.spec.timeBudget);
    }
    const started = performance.now();
    const action = this.fallbackAgent.choose(state, player);
    return { action, elapsedMs: performance.now() - started, mode: 'main-thread' };
  }

  /** Ask for a move. Never rejects for worker reasons — it falls back instead. */
  async choose(state: GameState, player: number): Promise<AiMove> {
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
      return {
        action: Action.fromId(response.actionId),
        elapsedMs: response.elapsedMs,
        mode: 'worker',
      };
    } catch (err) {
      if (err instanceof AiDisposed) throw err; // the caller is going away
      // A worker that dies mid-game hands the rest of the game to this thread.
      this.demote();
      return this.onMainThread(state, player);
    }
  }

  dispose(): void {
    for (const reject of this.pending.values()) reject(new AiDisposed('AI client disposed'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }
}
