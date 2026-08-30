/**
 * The `/api/*` client (§13).
 *
 * The only network the app ever touches besides Clerk (AC-005). Every call is
 * allowed to fail: play never depends on it, and offline is a state, not an
 * error (FR-037).
 */

export const CLIENT_VERSION = '1.0.0';

/** Same-origin in production; Pages and the Worker share `games.aclogics.com`. */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export interface LeaderboardEntry {
  rank: number;
  display_name: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
}

export interface Leaderboard {
  puzzle_id: string;
  entries: LeaderboardEntry[];
  total_entries: number;
  me: { rank: number; elapsed_ms: number } | null;
}

export interface DailyDescriptor {
  puzzle_id: string;
  seed: number;
  opponent: string;
  next_rollover_ms: number;
}

export interface ScoreSubmission {
  puzzle_id: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
  rounds: number;
  client_version: string;
}

export interface ScoreResult {
  accepted: true;
  improved: boolean;
  best_elapsed_ms: number;
  rank: number;
  total_entries: number;
}

/** A structured `{ error: { code, message } }` response, or a transport failure. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** True for the failures worth offering a retry on (§15). */
  get retryable(): boolean {
    return this.code === 'OFFLINE' || this.status >= 500;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...rest,
      headers: {
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError('OFFLINE', 'No connection', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? response.statusText,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export function getDaily(): Promise<DailyDescriptor> {
  return request<DailyDescriptor>('/daily');
}

export function getLeaderboard(puzzleId: string, token?: string): Promise<Leaderboard> {
  return request<Leaderboard>(
    `/leaderboard?puzzle_id=${encodeURIComponent(puzzleId)}&limit=100`,
    { token },
  );
}

export function postScore(submission: ScoreSubmission, token: string): Promise<ScoreResult> {
  return request<ScoreResult>('/scores', {
    method: 'POST',
    token,
    body: JSON.stringify(submission),
  });
}

export function deleteMe(token: string): Promise<{ deleted_scores: number; deleted_audit: number }> {
  return request('/me', { method: 'DELETE', token });
}

/**
 * Two automatic retries at 1s and 3s before the caller shows a manual retry
 * control (§15, "Worker 5xx").
 */
export async function withBackoff<T>(call: () => Promise<T>): Promise<T> {
  const delays = [1000, 3000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (err) {
      const retryable = err instanceof ApiError && err.retryable;
      if (!retryable || attempt >= delays.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
