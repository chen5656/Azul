-- Renames the opponent levels to the six-tier difficulty ladder and drops the
-- retired `random` opponent.
--
--   npx wrangler d1 execute quadro --remote --file worker/migrations/002_level_rename.sql
--
--   mcts    -> extreme      greedy -> medium
--   minimax -> master       random -> (deleted)
--
-- `random` has no successor tier. Its rows are deleted rather than folded into
-- `easy`: margins against a random opponent are not comparable with margins
-- against epsilon-greedy, and the UNIQUE (puzzle_id, user_id, ai_level) key
-- would collide for anyone who played both.

DELETE FROM scores WHERE ai_level = 'random';

UPDATE scores SET ai_level = 'extreme' WHERE ai_level = 'mcts';
UPDATE scores SET ai_level = 'master'  WHERE ai_level = 'minimax';
UPDATE scores SET ai_level = 'medium'  WHERE ai_level = 'greedy';
