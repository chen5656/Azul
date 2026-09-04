-- Adds attempts storage to a deployment created before `scores.attempts` existed.
-- New deployments get these from worker/schema.sql and must NOT run this.
--
--   npx wrangler d1 execute quadro --remote --file worker/migrations/005_attempts.sql

ALTER TABLE scores ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
