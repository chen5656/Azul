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
