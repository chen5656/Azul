/**
 * AI search, off the main thread (FR-008, NFR-003).
 *
 * The worker owns one agent at a time. It receives a serialized `GameState` and
 * replies with an action id, so nothing but plain JSON crosses the boundary.
 */

import { GameState } from '../engine';
import { type Agent, type AgentBudget, type AgentLevel, makeAgent } from '../ai';

export interface AiRequest {
  id: number;
  /** Rebuild the agent before searching; sent on the first request of a game. */
  init?: { level: AgentLevel; seed?: number; budget?: AgentBudget };
  state: Record<string, unknown>;
  player: number;
}

export type AiResponse =
  | {
      id: number;
      ok: true;
      actionId: number;
      elapsedMs: number;
      capped: boolean;
      simulations?: number;
      steps?: number;
    }
  | { id: number; ok: false; error: string };

let agent: Agent | null = null;

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, init, state, player } = event.data;
  const started = performance.now();
  try {
    if (init || agent === null) {
      const spec = init ?? { level: 'medium' as AgentLevel };
      agent = makeAgent(spec.level, spec.seed, spec.budget);
    }
    const action = agent.choose(GameState.fromDict(state), player);
    const reply: AiResponse = {
      id,
      ok: true,
      actionId: action.actionId,
      elapsedMs: performance.now() - started,
      capped: agent.cappedOut === true,
      simulations: agent.simulations,
      steps: agent.steps,
    };
    self.postMessage(reply);
  } catch (err) {
    const reply: AiResponse = { id, ok: false, error: (err as Error).message };
    self.postMessage(reply);
  }
};
