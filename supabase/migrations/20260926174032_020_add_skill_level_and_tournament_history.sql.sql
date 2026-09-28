/*
# Add skill_level to profiles + tournament_history table

## 1. profiles.skill_level
- New column `skill_level` (integer, 1-10, default 1)
- Existing profiles get default value 1
- Only admins can update skill_level (via set_user_skill_level function)

## 2. tournament_history
- New table to permanently store finalized tournament results
- RLS enabled: all authenticated users can read; only admins can insert/delete
- Survives ranking resets and tournament resets

## 3. Functions
- set_user_skill_level: admin-only function to set a player's skill level
- finalize_tournament: saves tournament data to history, marks tournament as complete
- check_all_rounds_complete: checks if all ranking rounds are completed
- check_round_complete: checks/completes a single round
*/

-- ============================================================
-- 1. Add skill_level to profiles
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'skill_level'
  ) THEN
    ALTER TABLE profiles ADD COLUMN skill_level integer NOT NULL DEFAULT 1;
    ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_check CHECK (skill_level >= 1 AND skill_level <= 10);
  END IF;
END $$;

-- Recreate public_profiles view with skill_level
DROP VIEW IF EXISTS public_profiles;
CREATE VIEW public_profiles AS
SELECT
  id,
  email,
  full_name,
  display_name,
  phone,
  avatar_url,
  role,
  skill_level,
  created_at
FROM profiles;

GRANT SELECT ON public_profiles TO authenticated;

-- ============================================================
-- 2. set_user_skill_level function (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION set_user_skill_level(
  p_target_user_id uuid,
  p_skill_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT raw_app_meta_data->>'role' = 'admin' INTO is_admin
  FROM auth.users WHERE id = auth.uid();

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o nivel do jogador';
  END IF;

  IF p_skill_level < 1 OR p_skill_level > 10 THEN
    RAISE EXCEPTION 'Nivel deve estar entre 1 e 10';
  END IF;

  UPDATE profiles
  SET skill_level = p_skill_level
  WHERE id = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_skill_level TO authenticated;

-- ============================================================
-- 3. Update get_own_profile to include skill_level (must DROP first)
-- ============================================================
DROP FUNCTION IF EXISTS get_own_profile();

CREATE FUNCTION get_own_profile()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  display_name text,
  phone text,
  avatar_url text,
  role text,
  skill_level integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.display_name,
    p.phone,
    p.avatar_url,
    p.role::text,
    p.skill_level,
    p.created_at
  FROM profiles p
  WHERE p.id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION get_own_profile TO authenticated;

-- ============================================================
-- 4. tournament_history table
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid,
  tournament_name text NOT NULL,
  finalized_date timestamptz NOT NULL DEFAULT now(),
  participant_count integer NOT NULL DEFAULT 0,
  champion_id uuid,
  champion_name text,
  final_standings jsonb NOT NULL DEFAULT '[]'::jsonb,
  playoff_results jsonb,
  match_results jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournament_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_tournament_history" ON tournament_history;
CREATE POLICY "read_tournament_history"
  ON tournament_history FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_tournament_history" ON tournament_history;
CREATE POLICY "insert_tournament_history"
  ON tournament_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "delete_tournament_history" ON tournament_history;
CREATE POLICY "delete_tournament_history"
  ON tournament_history FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

GRANT SELECT, INSERT, DELETE ON tournament_history TO authenticated;

-- ============================================================
-- 5. finalize_tournament function
-- ============================================================
CREATE OR REPLACE FUNCTION finalize_tournament(
  p_tournament_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  t_name text;
  t_created_by uuid;
  champ_id uuid;
  champ_name text;
  standings_json jsonb;
  playoff_json jsonb;
  matches_json jsonb;
  p_count integer;
  history_id uuid;
  final_match record;
BEGIN
  SELECT raw_app_meta_data->>'role' = 'admin' INTO is_admin
  FROM auth.users WHERE id = auth.uid();
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem finalizar torneios';
  END IF;

  SELECT name, created_by INTO t_name, t_created_by
  FROM tournaments_meta WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneio nao encontrado';
  END IF;

  SELECT player1_id, player2_id, winner_id INTO final_match
  FROM tournament_playoff_matches
  WHERE tournament_id = p_tournament_id AND stage = 'final'
  LIMIT 1;

  champ_id := final_match.winner_id;
  IF champ_id IS NOT NULL THEN
    SELECT display_name INTO champ_name FROM public_profiles WHERE id = champ_id;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO standings_json
  FROM (
    SELECT
      g.group_label,
      gsm.player_id,
      pp.display_name,
      pp.avatar_url,
      COALESCE(SUM(CASE WHEN ggm.winner_id = gsm.player_id THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN ggm.winner_id IS NOT NULL AND ggm.winner_id != gsm.player_id THEN 1 ELSE 0 END), 0) AS losses,
      COALESCE(SUM(CASE WHEN ggm.winner_id = gsm.player_id THEN 3 ELSE 0 END), 0) AS points,
      COALESCE(COUNT(ggm.id), 0) AS played
    FROM tournament_groups g
    JOIN tournament_group_members gsm ON gsm.group_id = g.id
    LEFT JOIN tournament_group_matches ggm ON ggm.group_id = g.id
      AND (ggm.player1_id = gsm.player_id OR ggm.player2_id = gsm.player_id)
    LEFT JOIN public_profiles pp ON pp.id = gsm.player_id
    WHERE g.tournament_id = p_tournament_id
    GROUP BY g.group_label, gsm.player_id, pp.display_name, pp.avatar_url
    ORDER BY g.group_label, points DESC, wins DESC
  ) s;

  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO playoff_json
  FROM (
    SELECT stage, match_number, player1_id, player2_id, winner_id, set1_p1, set1_p2
    FROM tournament_playoff_matches
    WHERE tournament_id = p_tournament_id
    ORDER BY stage, match_number
  ) p;

  SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb) INTO matches_json
  FROM (
    SELECT
      g.group_label,
      m.player1_id, m.player2_id, m.winner_id, m.set1_p1, m.set1_p2
    FROM tournament_group_matches m
    JOIN tournament_groups g ON g.id = m.group_id
    WHERE g.tournament_id = p_tournament_id
  ) m;

  SELECT COUNT(DISTINCT player_id) INTO p_count
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id AND approved = true;

  INSERT INTO tournament_history (
    tournament_id, tournament_name, participant_count,
    champion_id, champion_name, final_standings,
    playoff_results, match_results, created_by
  )
  VALUES (
    p_tournament_id, t_name, p_count,
    champ_id, champ_name, standings_json,
    playoff_json, matches_json, t_created_by
  )
  RETURNING id INTO history_id;

  UPDATE tournaments_meta SET status = 'complete', end_date = now() WHERE id = p_tournament_id;

  RETURN history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_tournament TO authenticated;

-- ============================================================
-- 6. check_all_rounds_complete function
-- ============================================================
CREATE OR REPLACE FUNCTION check_all_rounds_complete()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_rounds integer;
  completed_rounds integer;
BEGIN
  SELECT COUNT(*) INTO total_rounds FROM ranking_rounds;
  IF total_rounds = 0 THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO completed_rounds
  FROM ranking_rounds WHERE status = 'completed';

  RETURN completed_rounds = total_rounds;
END;
$$;

GRANT EXECUTE ON FUNCTION check_all_rounds_complete TO authenticated;

-- ============================================================
-- 7. check_round_complete function
-- ============================================================
CREATE OR REPLACE FUNCTION check_round_complete(
  p_round_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_matches integer;
  completed_matches integer;
  has_bye boolean;
BEGIN
  SELECT COUNT(*) INTO total_matches
  FROM ranking_matches WHERE round_id = p_round_id;

  SELECT COUNT(*) INTO completed_matches
  FROM ranking_matches WHERE round_id = p_round_id AND winner_id IS NOT NULL;

  SELECT EXISTS(
    SELECT 1 FROM ranking_match_byes WHERE round_id = p_round_id
  ) INTO has_bye;

  IF total_matches > 0 AND completed_matches = total_matches THEN
    UPDATE ranking_rounds SET status = 'completed' WHERE id = p_round_id;
    RETURN true;
  END IF;

  IF total_matches = 0 AND has_bye THEN
    UPDATE ranking_rounds SET status = 'completed' WHERE id = p_round_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION check_round_complete TO authenticated;
