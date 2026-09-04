/**
 * The `/api/*` client (§13).
 *
 * The only network the app ever touches (AC-005). Every call is allowed to
 * fail: play never depends on it, and offline is a state, not an error
 * (FR-037).
 *
 * Authentication is the session cookie better-auth sets, so there is no token
 * to thread through: `credentials: 'include'` is the whole of it.
 */

export const CLIENT_VERSION = '1.0.0';

/** Same-origin in production; Pages and the Worker share `acgame.win`. */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export interface LeaderboardEntry {
  rank: number;
  display_name: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
  attempts?: number;
  replay?: string | null;
}

export interface Leaderboard {
  puzzle_id: string;
  ai_level: string;
  entries: LeaderboardEntry[];
  total_entries: number;
  me: {
    rank: number;
    elapsed_ms: number;
    final_score: number;
    opponent_score: number;
    attempts?: number;
    replay?: string | null;
  } | null;
}

export interface HistoryEntry {
  puzzle_id: string;
  ai_level: string;
  elapsed_ms: number;
  final_score: number;
  opponent_score: number;
  margin: number;
  rounds: number;
  attempts?: number;
  /** The replay code, when the attempt was posted by a client that sends one. */
  replay: string | null;
  verified: boolean;
  played_at: number;
  rank: number | null;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Cursor for the next page, or null at the end. */
  next_before: string | null;
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
  ai_level: string;
  client_version: string;
  attempts?: number;
  /**
   * The base64url replay code. Sending it lets the Worker re-run the game and
   * mark the row verified; a replay that does not produce the posted score is
   * rejected, so this is never sent for a game the client did not actually play.
   */
  replay?: string;
}

export interface ScoreResult {
  accepted: true;
  improved: boolean;
  /** True when the Worker re-ran the attached replay and it matched. */
  verified?: boolean;
  best_elapsed_ms: number;
  best_final_score?: number;
  best_opponent_score?: number;
  attempts?: number;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
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

export function getLeaderboard(puzzleId: string, aiLevel: string): Promise<Leaderboard> {
  return request<Leaderboard>(
    `/leaderboard?puzzle_id=${encodeURIComponent(puzzleId)}&ai=${encodeURIComponent(aiLevel)}&limit=100`,
  );
}

export function postScore(submission: ScoreSubmission): Promise<ScoreResult> {
  return request<ScoreResult>('/scores', {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

export function getHistory(
  options: { before?: string | null; limit?: number } = {},
): Promise<HistoryPage> {
  const params = new URLSearchParams();
  if (options.before) params.set('before', options.before);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return request<HistoryPage>(`/me/history${query ? `?${query}` : ''}`);
}

export function deleteMe(): Promise<{ deleted_scores: number; deleted_audit: number }> {
  return request('/me', { method: 'DELETE' });
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
