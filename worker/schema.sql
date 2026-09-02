-- Quadro Daily leaderboard storage (BUILD-SPEC §12.1).
--
--   npx wrangler d1 execute quadro --remote --file worker/schema.sql

CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id     TEXT    NOT NULL,          -- 'YYYY-MM-DD' in America/New_York
  user_id       TEXT    NOT NULL,          -- Clerk user id (sub claim)
  display_name  TEXT    NOT NULL,
  elapsed_ms    INTEGER NOT NULL,
  final_score   INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  ai_level      TEXT    NOT NULL DEFAULT 'extreme', -- opponent agent the attempt was played against
  rounds        INTEGER NOT NULL,
  client_version TEXT   NOT NULL,
  -- The base64url replay code from `src/replay/codec.ts`: the seed plus one
  -- byte per action, so a whole game costs ~90 bytes — less than the board
  -- states it rebuilds. NULL for rows posted by clients that predate replays.
  replay        TEXT,
  -- 1 when the Worker re-ran `replay` and the moves produced the posted score.
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,          -- epoch ms, server-assigned
  updated_at    INTEGER NOT NULL,
  UNIQUE (puzzle_id, user_id, ai_level)
);

CREATE INDEX IF NOT EXISTS idx_scores_board
  ON scores (puzzle_id, ai_level, (final_score - opponent_score) DESC, elapsed_ms ASC, created_at ASC);

-- Append-only. Makes the per-user rate limit enforceable without a KV counter
-- and leaves a forensic trail if the board is ever polluted.
CREATE TABLE IF NOT EXISTS submissions_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id  TEXT    NOT NULL,
  user_id    TEXT    NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  accepted   INTEGER NOT NULL,             -- 0/1
  reason     TEXT,                         -- rejection code when accepted = 0
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON submissions_audit (user_id, created_at DESC);

-- Serves `GET /api/me/history` without walking the board index.
CREATE INDEX IF NOT EXISTS idx_scores_user
  ON scores (user_id, puzzle_id DESC, ai_level);
