-- Adds the opponent agent to `scores` and makes the board per-agent.
--
--   npx wrangler d1 execute quadro --remote --file worker/migrations/001_ai_level.sql
--
-- SQLite cannot alter a UNIQUE constraint in place, so the table is rebuilt.
-- Existing rows predate the per-agent board and were all played against the
-- Monte Carlo opponent, which is what they are backfilled as.

PRAGMA foreign_keys = OFF;

CREATE TABLE scores_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id     TEXT    NOT NULL,
  user_id       TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  elapsed_ms    INTEGER NOT NULL,
  final_score   INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  ai_level      TEXT    NOT NULL DEFAULT 'mcts',
  rounds        INTEGER NOT NULL,
  client_version TEXT   NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (puzzle_id, user_id, ai_level)
);

INSERT INTO scores_new (id, puzzle_id, user_id, display_name, elapsed_ms, final_score,
                        opponent_score, ai_level, rounds, client_version, created_at, updated_at)
  SELECT id, puzzle_id, user_id, display_name, elapsed_ms, final_score,
         opponent_score, 'mcts', rounds, client_version, created_at, updated_at
    FROM scores;

DROP TABLE scores;
ALTER TABLE scores_new RENAME TO scores;

DROP INDEX IF EXISTS idx_scores_board;
CREATE INDEX idx_scores_board
  ON scores (puzzle_id, ai_level, (final_score - opponent_score) DESC, elapsed_ms ASC, created_at ASC);

PRAGMA foreign_keys = ON;
