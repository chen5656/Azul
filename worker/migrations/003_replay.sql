-- Adds replay storage to a deployment created before `scores.replay` existed.
-- New deployments get these from worker/schema.sql and must NOT run this.
--
--   npx wrangler d1 execute quadro --remote --file worker/migrations/0002_replay.sql

ALTER TABLE scores ADD COLUMN replay TEXT;
ALTER TABLE scores ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_scores_user
  ON scores (user_id, puzzle_id DESC, ai_level);
