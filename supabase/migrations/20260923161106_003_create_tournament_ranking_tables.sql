/*
# Create tournament management tables

1. New Tables
- `tournaments_meta`: tournament metadata (name, status, period, admin owner)
- `tournament_registrations`: players signed up for a tournament (unique per tournament/player)
- `tournament_groups`: groups of 4 players within a tournament
- `tournament_group_members`: which player is in which group
- `tournament_group_matches`: round-robin matches within groups (set scores + SUP)
- `tournament_playoff_matches`: elimination bracket matches (QF, SF, Final)
- `ranking_rounds`: ranking rounds (exactly 4, 2 matches each)
- `ranking_matches`: matches within ranking rounds (set scores + SUP)
- `ranking_match_history`: history of all ranking matchups to prevent repetition

2. Security
- All tables have RLS enabled
- SELECT: authenticated users can read all data
- INSERT/UPDATE/DELETE: only admins (profiles.role = 'admin') can modify management data
- Players can insert/delete their own registration (sign up / cancel)

3. Notes
- Existing tables (tournaments, tournament_edit_secrets, profiles) are NOT modified
- Set scores stored as integers. SUP stored separately, only when sets split 1-1
*/

CREATE TABLE IF NOT EXISTS tournaments_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'registration' CHECK (status IN ('registration', 'groups_drawn', 'playoffs', 'complete')),
  start_date date,
  end_date date,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournaments_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournaments_meta_select" ON tournaments_meta;
CREATE POLICY "tournaments_meta_select" ON tournaments_meta FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tournaments_meta_admin_write" ON tournaments_meta;
CREATE POLICY "tournaments_meta_admin_write" ON tournaments_meta FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "tournaments_meta_admin_update" ON tournaments_meta;
CREATE POLICY "tournaments_meta_admin_update" ON tournaments_meta FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "tournaments_meta_admin_delete" ON tournaments_meta;
CREATE POLICY "tournaments_meta_admin_delete" ON tournaments_meta FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments_meta(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, player_id)
);

ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "registrations_select" ON tournament_registrations;
CREATE POLICY "registrations_select" ON tournament_registrations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "registrations_insert_own" ON tournament_registrations;
CREATE POLICY "registrations_insert_own" ON tournament_registrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "registrations_delete_own" ON tournament_registrations;
CREATE POLICY "registrations_delete_own" ON tournament_registrations FOR DELETE TO authenticated USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "registrations_admin_update" ON tournament_registrations;
CREATE POLICY "registrations_admin_update" ON tournament_registrations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments_meta(id) ON DELETE CASCADE,
  group_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, group_label)
);

ALTER TABLE tournament_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select" ON tournament_groups;
CREATE POLICY "groups_select" ON tournament_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "groups_admin_write" ON tournament_groups;
CREATE POLICY "groups_admin_write" ON tournament_groups FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "groups_admin_delete" ON tournament_groups;
CREATE POLICY "groups_admin_delete" ON tournament_groups FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS tournament_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_position int NOT NULL DEFAULT 0,
  UNIQUE (group_id, player_id)
);

ALTER TABLE tournament_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_select" ON tournament_group_members;
CREATE POLICY "group_members_select" ON tournament_group_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "group_members_admin_write" ON tournament_group_members;
CREATE POLICY "group_members_admin_write" ON tournament_group_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "group_members_admin_delete" ON tournament_group_members;
CREATE POLICY "group_members_admin_delete" ON tournament_group_members FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS tournament_group_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set1_p1 int, set1_p2 int,
  set2_p1 int, set2_p2 int,
  sup_p1 int, sup_p2 int,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, player1_id, player2_id)
);

ALTER TABLE tournament_group_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_matches_select" ON tournament_group_matches;
CREATE POLICY "group_matches_select" ON tournament_group_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "group_matches_admin_update" ON tournament_group_matches;
CREATE POLICY "group_matches_admin_update" ON tournament_group_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "group_matches_admin_insert" ON tournament_group_matches;
CREATE POLICY "group_matches_admin_insert" ON tournament_group_matches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS tournament_playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments_meta(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('quarterfinal', 'semifinal', 'final')),
  match_number int NOT NULL,
  player1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set1_p1 int, set1_p2 int, set2_p1 int, set2_p2 int,
  set3_p1 int, set3_p2 int, set4_p1 int, set4_p2 int, set5_p1 int, set5_p2 int,
  sup_p1 int, sup_p2 int,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, stage, match_number)
);

ALTER TABLE tournament_playoff_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "playoff_matches_select" ON tournament_playoff_matches;
CREATE POLICY "playoff_matches_select" ON tournament_playoff_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "playoff_matches_admin_update" ON tournament_playoff_matches;
CREATE POLICY "playoff_matches_admin_update" ON tournament_playoff_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "playoff_matches_admin_insert" ON tournament_playoff_matches;
CREATE POLICY "playoff_matches_admin_insert" ON tournament_playoff_matches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS ranking_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number int NOT NULL CHECK (round_number IN (1, 2, 3, 4)),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_number)
);

ALTER TABLE ranking_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_rounds_select" ON ranking_rounds;
CREATE POLICY "ranking_rounds_select" ON ranking_rounds FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_rounds_admin_write" ON ranking_rounds;
CREATE POLICY "ranking_rounds_admin_write" ON ranking_rounds FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_rounds_admin_update" ON ranking_rounds;
CREATE POLICY "ranking_rounds_admin_update" ON ranking_rounds FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_rounds_admin_delete" ON ranking_rounds;
CREATE POLICY "ranking_rounds_admin_delete" ON ranking_rounds FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS ranking_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES ranking_rounds(id) ON DELETE CASCADE,
  match_number int NOT NULL CHECK (match_number IN (1, 2)),
  player1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set1_p1 int, set1_p2 int, set2_p1 int, set2_p2 int,
  sup_p1 int, sup_p2 int,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, match_number)
);

ALTER TABLE ranking_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_matches_select" ON ranking_matches;
CREATE POLICY "ranking_matches_select" ON ranking_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_matches_admin_update" ON ranking_matches;
CREATE POLICY "ranking_matches_admin_update" ON ranking_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_matches_admin_insert" ON ranking_matches;
CREATE POLICY "ranking_matches_admin_insert" ON ranking_matches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_matches_admin_delete" ON ranking_matches;
CREATE POLICY "ranking_matches_admin_delete" ON ranking_matches FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS ranking_match_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id uuid REFERENCES ranking_rounds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ranking_match_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_history_select" ON ranking_match_history;
CREATE POLICY "ranking_history_select" ON ranking_match_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_history_admin_insert" ON ranking_match_history;
CREATE POLICY "ranking_history_admin_insert" ON ranking_match_history FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_history_admin_delete" ON ranking_match_history;
CREATE POLICY "ranking_history_admin_delete" ON ranking_match_history FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_registrations_player ON tournament_registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON tournament_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_group ON tournament_group_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_playoff_matches_tournament ON tournament_playoff_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_ranking_matches_round ON ranking_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_p1 ON ranking_match_history(player1_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_p2 ON ranking_match_history(player2_id);

ALTER TABLE tournaments_meta REPLICA IDENTITY FULL;
ALTER TABLE tournament_group_matches REPLICA IDENTITY FULL;
ALTER TABLE tournament_playoff_matches REPLICA IDENTITY FULL;
ALTER TABLE ranking_matches REPLICA IDENTITY FULL;
ALTER TABLE ranking_rounds REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournaments_meta') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournaments_meta;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_group_matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_group_matches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_playoff_matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_playoff_matches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ranking_matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ranking_matches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ranking_rounds') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ranking_rounds;
  END IF;
END $$;
