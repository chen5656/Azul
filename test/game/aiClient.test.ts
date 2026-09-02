/**
 * The AI client's speculative search (`prefetch`).
 *
 * Levels spend a fixed amount of work per move rather than a slice of clock, so
 * that the opponent is the same on every device (see `src/ai/budget.ts`). What
 * pays for that is starting the search under the animation that precedes it —
 * which is only sound if a prefetched answer is used for exactly the question it
 * answers, and dropped otherwise.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuadroGame, applyAction, legalActions } from '../../src/engine';
import { AiClient } from '../../src/game/aiClient';
import type { AiRequest, AiResponse } from '../../src/workers/ai.worker';

/** A worker that records what it was asked and answers on a later task. */
class FakeWorker implements Pick<Worker, 'postMessage' | 'terminate'> {
  static last: FakeWorker | null = null;
  readonly requests: AiRequest[] = [];
  private readonly listeners = new Set<(event: MessageEvent<AiResponse>) => void>();

  constructor() {
    FakeWorker.last = this;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.add(listener as (e: MessageEvent<AiResponse>) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') {
      this.listeners.delete(listener as (e: MessageEvent<AiResponse>) => void);
    }
  }

  postMessage(request: AiRequest): void {
    this.requests.push(request);
    // The real worker replies on a later task; so does this one.
    setTimeout(() => {
      const reply: AiResponse = {
        id: request.id,
        ok: true,
        actionId: 0,
        elapsedMs: 1,
        capped: false,
      };
      for (const listener of this.listeners) {
        listener({ data: reply } as MessageEvent<AiResponse>);
      }
    }, 0);
  }

  terminate(): void {
    this.listeners.clear();
  }
}

function install(): void {
  vi.stubGlobal('Worker', FakeWorker);
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.last = null;
});

describe('prefetch', () => {
  it('answers the question it was primed with, without searching twice', async () => {
    install();
    const game = new QuadroGame(31);
    const client = new AiClient({ level: 'medium', seed: 1 });

    client.prefetch(game.state, game.state.current);
    const worker = FakeWorker.last!;
    expect(worker.requests).toHaveLength(1);

    const move = await client.choose(game.state, game.state.current);
    expect(move.prefetched).toBe(true);
    // The whole point: the search ran once, ahead of the ask.
    expect(worker.requests).toHaveLength(1);
    client.dispose();
  });

  it('drops a prefetch that answers a different position', async () => {
    install();
    const game = new QuadroGame(31);
    const stale = game.state.clone();

    const client = new AiClient({ level: 'medium', seed: 1 });
    client.prefetch(stale, stale.current);
    const worker = FakeWorker.last!;

    // The position moves on before the answer is collected.
    const moved = game.state.clone();
    applyAction(moved, legalActions(moved)[0]);

    const move = await client.choose(moved, moved.current);
    expect(move.prefetched).toBeUndefined();
    // Two searches: the wasted speculative one, and the real one behind it.
    expect(worker.requests).toHaveLength(2);
    client.dispose();
  });

  it('does not stack speculative searches', () => {
    install();
    const game = new QuadroGame(31);
    const client = new AiClient({ level: 'medium', seed: 1 });

    client.prefetch(game.state, game.state.current);
    client.prefetch(game.state, game.state.current);
    expect(FakeWorker.last!.requests).toHaveLength(1);
    client.dispose();
  });
});
