// Mirrors backend/app/schemas.py. Protocol changes land in schemas.py first.

export const COLORS = ["blue", "yellow", "red", "black", "white"] as const;
export type Color = (typeof COLORS)[number];

export type Mode = "pvp" | "pve" | "eve";
export type AiLevel = "random" | "greedy" | "minimax" | "mcts" | "azulzero";
export type ErrorCode = "ILLEGAL_ACTION" | "NOT_YOUR_TURN" | "GAME_OVER" | "BAD_MESSAGE";

export const CENTER = 5; // source id of the center pool
export const PENALTY_DEST = 5; // dest id of the penalty row
export const NUM_DISPLAYS = 5;
export const NUM_ROWS = 5;
export const STAGING_CAPACITY = [1, 2, 3, 4, 5];
export const PENALTIES = [-1, -1, -2, -2, -2, -3, -3];

export type TileCounts = Partial<Record<Color, number>>;

export interface PlayerView {
  staging_colors: (Color | null)[];
  staging_counts: number[];
  grid: boolean[][];
  penalty_tiles: (Color | "first_token")[];
  penalty_overflow: number;
  score: number;
  has_first_token: boolean;
}

export interface ResultView {
  scores: number[];
  winner: number | null;
  draw: boolean;
  complete_rows: number[];
  rounds: number;
}

export interface GameStateView {
  game_id: string;
  mode: Mode;
  displays: TileCounts[];
  center: TileCounts;
  center_has_token: boolean;
  bag: Record<Color, number>;
  discard: Record<Color, number>;
  players: PlayerView[];
  current: number;
  first_player: number;
  phase: "drafting" | "game_over";
  round_num: number;
  agents: Record<string, AiLevel>;
  result: ResultView | null;
}

export interface ActionView {
  source: number;
  color: Color;
  dest: number;
  action_id: number;
}

export type GameEvent = { kind: string } & Record<string, unknown>;

export type ServerMessage =
  | ({ type: "state" } & GameStateView)
  | { type: "events"; events: GameEvent[] }
  | { type: "legal_actions"; actions: number[]; detail: ActionView[] }
  | { type: "ai_thinking"; player: number; level: AiLevel }
  | { type: "error"; code: ErrorCode; message: string };

export type ClientMessage =
  | { type: "action"; source: number; color: Color; dest: number }
  | { type: "eve_control"; command: "play" | "pause" | "step"; interval_ms?: number }
  | { type: "resync" };

/** Must match Action.action_id in backend/engine/state.py. */
export function actionId(source: number, color: Color, dest: number): number {
  return (source * COLORS.length + COLORS.indexOf(color)) * 6 + dest;
}

export function sourceLabel(source: number): string {
  return source === CENTER ? "中央池" : `展台 ${source + 1}`;
}

/** Expand a {color: count} map into a flat list of tiles for rendering. */
export function tileList(counts: TileCounts): Color[] {
  const out: Color[] = [];
  for (const color of COLORS) for (let i = 0; i < (counts[color] ?? 0); i++) out.push(color);
  return out;
}
