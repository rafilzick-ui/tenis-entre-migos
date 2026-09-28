/*
# Create ranking_match_byes table

1. New Table
- `ranking_match_byes`: records which player had a bye (no match) in each ranking round
  - `id` (uuid PK)
  - `round_id` (uuid FK to ranking_rounds)
  - `player_id` (uuid FK to auth.users)
  - `created_at` (timestamptz)
  - UNIQUE (round_id, player_id) — one bye per player per round

2. Security
- RLS enabled
- SELECT: authenticated can read
- INSERT/DELETE: admin only
*/

CREATE TABLE IF NOT EXISTS ranking_match_byes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES ranking_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

ALTER TABLE ranking_match_byes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_byes_select" ON ranking_match_byes;
CREATE POLICY "ranking_byes_select"
  ON ranking_match_byes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_byes_admin_insert" ON ranking_match_byes;
CREATE POLICY "ranking_byes_admin_insert"
  ON ranking_match_byes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_byes_admin_delete" ON ranking_match_byes;
CREATE POLICY "ranking_byes_admin_delete"
  ON ranking_match_byes FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_ranking_byes_round ON ranking_match_byes(round_id);
CREATE INDEX IF NOT EXISTS idx_ranking_byes_player ON ranking_match_byes(player_id);
