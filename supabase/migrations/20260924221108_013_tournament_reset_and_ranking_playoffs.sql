/*
# Tournament Reset + Ranking Playoff Generation

1. New Functions
- `reset_tournament()`: SECURITY DEFINER function that clears all tournament
  competitive state (groups, members, matches, playoffs, results, champion)
  while preserving users, profiles, ranking, amistosos, messages, and auth data.
  Only admins can execute. The reset is atomic via a single DO block.
- `generate_ranking_playoffs()`: SECURITY DEFINER function that generates the
  ranking mata-mata after all 4 ranking rounds are completed. Classifies top 4
  (if <=8 participants) or top 8 (if >8) and creates semifinal + final matches
  (or quarterfinal + semifinal + final). Only admins can execute.

2. Security
- Both functions are SECURITY DEFINER and check admin role via auth.jwt().
- REVOKE EXECUTE FROM PUBLIC and FROM anon to prevent unauthorized calls.
- GRANT EXECUTE TO authenticated only.

3. Tables Affected (reset_tournament)
- tournament_group_matches: DELETE all rows
- tournament_group_members: DELETE all rows
- tournament_groups: DELETE all rows
- tournament_playoff_matches: DELETE all rows
- tournaments_meta: UPDATE status to 'registration' (reset to initial state)
- Does NOT touch: profiles, ranking_*, friendly_*, tournaments, auth.users

4. Tables Affected (generate_ranking_playoffs)
- Creates a new table `ranking_playoff_matches` to store the ranking mata-mata.
*/

-- ============================================================
-- 1. Ranking playoff matches table
-- ============================================================
CREATE TABLE IF NOT EXISTS ranking_playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL DEFAULT 'quarterfinal',
  match_number integer NOT NULL,
  player1_id uuid,
  player2_id uuid,
  set1_p1 integer,
  set1_p2 integer,
  set2_p1 integer,
  set2_p2 integer,
  sup_p1 integer,
  sup_p2 integer,
  winner_id uuid,
  next_match_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ranking_playoff_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_ranking_playoffs" ON ranking_playoff_matches;
CREATE POLICY "select_ranking_playoffs" ON ranking_playoff_matches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "update_ranking_playoffs" ON ranking_playoff_matches;
CREATE POLICY "update_ranking_playoffs" ON ranking_playoff_matches
  FOR UPDATE TO authenticated USING (auth.uid() = player1_id OR auth.uid() = player2_id) WITH CHECK (true);

-- ============================================================
-- 2. Reset tournament function (admin only, SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_tournament()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() ->> 'raw_app_meta_data')::jsonb ->> 'role' = 'admin'
  INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta operacao';
  END IF;

  -- Clear all tournament competitive state (atomic)
  DELETE FROM tournament_playoff_matches;
  DELETE FROM tournament_group_matches;
  DELETE FROM tournament_group_members;
  DELETE FROM tournament_groups;

  -- Reset tournament meta status to registration
  UPDATE tournaments_meta SET status = 'registration', updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION reset_tournament() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_tournament() FROM anon;
GRANT EXECUTE ON FUNCTION reset_tournament() TO authenticated;

-- ============================================================
-- 3. Generate ranking playoffs function (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_ranking_playoffs()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_all_done boolean;
  v_round_count integer;
  v_done_count integer;
  v_player_count integer;
  v_classify_count integer;
  v_rank_record record;
  v_rankings jsonb;
  v_i integer;
  v_qf1_id uuid;
  v_qf2_id uuid;
  v_qf3_id uuid;
  v_qf4_id uuid;
  v_sf1_id uuid;
  v_sf2_id uuid;
  v_final_id uuid;
BEGIN
  SELECT (auth.jwt() ->> 'raw_app_meta_data')::jsonb ->> 'role' = 'admin'
  INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta operacao';
  END IF;

  -- Check all 4 rounds are completed
  SELECT count(*), count(*) FILTER (WHERE status = 'completed')
  INTO v_round_count, v_done_count
  FROM ranking_rounds;

  IF v_round_count < 4 THEN
    RAISE EXCEPTION 'As 4 rodadas do ranking ainda nao foram criadas';
  END IF;

  IF v_done_count < 4 THEN
    RAISE EXCEPTION 'Nem todas as 4 rodadas estao concluidas (% de 4)', v_done_count;
  END IF;

  -- Clear existing ranking playoffs
  DELETE FROM ranking_playoff_matches;

  -- Compute rankings from ranking_matches
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t->>'points')::int DESC, (t->>'won')::int DESC, (t->>'sets_won')::int DESC), '[]'::jsonb)
  INTO v_rankings
  FROM (
    SELECT
      p.player_id,
      p.display_name,
      p.played,
      p.won,
      p.lost,
      p.sets_won,
      p.points
    FROM (
      SELECT
        winner_id AS player_id,
        count(*) AS won,
        0 AS lost,
        0 AS sets_won,
        18 * count(*) AS points,
        count(*) AS played
      FROM ranking_matches
      WHERE winner_id IS NOT NULL
      GROUP BY winner_id
      UNION ALL
      SELECT
        CASE WHEN player1_id = winner_id THEN player2_id ELSE player1_id END AS player_id,
        0 AS won,
        count(*) AS lost,
        0 AS sets_won,
        0 AS points,
        count(*) AS played
      FROM ranking_matches
      WHERE winner_id IS NOT NULL
      GROUP BY CASE WHEN player1_id = winner_id THEN player2_id ELSE player1_id END
    ) AS stats
    JOIN public_profiles pp ON pp.id = stats.player_id
    GROUP BY stats.player_id, pp.display_name, stats.played, stats.won, stats.lost, stats.sets_won, stats.points
  ) p;

  v_player_count := jsonb_array_length(v_rankings);

  IF v_player_count < 4 THEN
    RAISE EXCEPTION 'Necessario pelo menos 4 jogadores classificados';
  END IF;

  -- Determine how many to classify
  IF v_player_count <= 8 THEN
    v_classify_count := 4;  -- Top 4 only
  ELSE
    v_classify_count := 8;  -- Top 8
  END IF;

  -- Generate matches
  IF v_classify_count = 4 THEN
    -- Semifinals: 1v4, 2v3 + final
    v_sf1_id := gen_random_uuid();
    v_sf2_id := gen_random_uuid();
    v_final_id := gen_random_uuid();

    INSERT INTO ranking_playoff_matches (id, stage, match_number, player1_id, player2_id, next_match_id)
    VALUES (v_sf1_id, 'semifinal', 1,
      (v_rankings->0->>'player_id')::uuid,
      (v_rankings->3->>'player_id')::uuid,
      v_final_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, player1_id, player2_id, next_match_id)
    VALUES (v_sf2_id, 'semifinal', 2,
      (v_rankings->1->>'player_id')::uuid,
      (v_rankings->2->>'player_id')::uuid,
      v_final_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, next_match_id)
    VALUES (v_final_id, 'final', 1, NULL);

    RETURN 'Semifinais e final geradas (4 jogadores classificados)';
  ELSE
    -- Quarterfinals: 1v8, 2v7, 3v6, 4v5 + semis + final
    v_qf1_id := gen_random_uuid();
    v_qf2_id := gen_random_uuid();
    v_qf3_id := gen_random_uuid();
    v_qf4_id := gen_random_uuid();
    v_sf1_id := gen_random_uuid();
    v_sf2_id := gen_random_uuid();
    v_final_id := gen_random_uuid();

    INSERT INTO ranking_playoff_matches (id, stage, match_number, player1_id, player2_id, next_match_id)
    VALUES (v_qf1_id, 'quarterfinal', 1,
      (v_rankings->0->>'player_id')::uuid,
      (v_rankings->7->>'player_id')::uuid,
      v_sf1_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, player1_id, player2_id, next_match_id)
    VALUES (v_qf2_id, 'quarterfinal', 2,
      (v_rankings->3->>'player_id')::uuid,
      (v_rankings->4->>'player_id')::uuid,
      v_sf1_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, player1_id, player2_id, next_match_id)
    VALUES (v_qf3_id, 'quarterfinal', 3,
      (v_rankings->1->>'player_id')::uuid,
      (v_rankings->6->>'player_id')::uuid,
      v_sf2_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, player1_id, player2_id, next_match_id)
    VALUES (v_qf4_id, 'quarterfinal', 4,
      (v_rankings->2->>'player_id')::uuid,
      (v_rankings->5->>'player_id')::uuid,
      v_sf2_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, next_match_id)
    VALUES (v_sf1_id, 'semifinal', 1, v_final_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, next_match_id)
    VALUES (v_sf2_id, 'semifinal', 2, v_final_id);

    INSERT INTO ranking_playoff_matches (id, stage, match_number, next_match_id)
    VALUES (v_final_id, 'final', 1, NULL);

    RETURN 'Quartas, semifinais e final geradas (8 jogadores classificados)';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_ranking_playoffs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_ranking_playoffs() FROM anon;
GRANT EXECUTE ON FUNCTION generate_ranking_playoffs() TO authenticated;

-- ============================================================
-- 4. Save ranking playoff result function (admin or players)
-- ============================================================
CREATE OR REPLACE FUNCTION save_ranking_playoff_result(
  p_match_id uuid,
  p_set1_p1 integer,
  p_set1_p2 integer,
  p_set2_p1 integer DEFAULT NULL,
  p_set2_p2 integer DEFAULT NULL,
  p_sup_p1 integer DEFAULT NULL,
  p_sup_p2 integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match ranking_playoff_matches%ROWTYPE;
  v_winner_id uuid;
  v_is_admin boolean;
  v_is_player boolean;
BEGIN
  SELECT (auth.jwt() ->> 'raw_app_meta_data')::jsonb ->> 'role' = 'admin'
  INTO v_is_admin;

  SELECT * INTO v_match FROM ranking_playoff_matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida nao encontrada';
  END IF;

  v_is_player := auth.uid() = v_match.player1_id OR auth.uid() = v_match.player2_id;

  IF NOT v_is_admin AND NOT v_is_player THEN
    RAISE EXCEPTION 'Voce nao tem permissao para editar esta partida';
  END IF;

  -- Determine winner from set 1 (and set 2 if provided)
  IF p_set2_p1 IS NOT NULL AND p_set2_p2 IS NOT NULL THEN
    -- Two sets played
    IF p_set1_p1 > p_set1_p2 AND p_set2_p1 > p_set2_p2 THEN
      v_winner_id := v_match.player1_id;
    ELSIF p_set1_p2 > p_set1_p1 AND p_set2_p2 > p_set2_p1 THEN
      v_winner_id := v_match.player2_id;
    ELSIF p_set1_p1 > p_set1_p2 AND p_set1_p2 > p_set1_p1 THEN
      -- 1-1, check SUP
      IF p_sup_p1 IS NOT NULL AND p_sup_p2 IS NOT NULL AND p_sup_p1 > p_sup_p2 THEN
        v_winner_id := v_match.player1_id;
      ELSIF p_sup_p1 IS NOT NULL AND p_sup_p2 IS NOT NULL AND p_sup_p2 > p_sup_p1 THEN
        v_winner_id := v_match.player2_id;
      END IF;
    END IF;
  ELSE
    -- Single set only (ranking matches can be 1 or 2 sets)
    IF p_set1_p1 > p_set1_p2 THEN
      v_winner_id := v_match.player1_id;
    ELSIF p_set1_p2 > p_set1_p1 THEN
      v_winner_id := v_match.player2_id;
    END IF;
  END IF;

  IF v_winner_id IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel determinar o vencedor';
  END IF;

  UPDATE ranking_playoff_matches
  SET set1_p1 = p_set1_p1, set1_p2 = p_set1_p2,
      set2_p1 = p_set2_p1, set2_p2 = p_set2_p2,
      sup_p1 = p_sup_p1, sup_p2 = p_sup_p2,
      winner_id = v_winner_id
  WHERE id = p_match_id;

  -- Advance winner to next match
  IF v_match.next_match_id IS NOT NULL THEN
    UPDATE ranking_playoff_matches
    SET player1_id = COALESCE(player1_id, v_winner_id),
        player2_id = CASE WHEN player1_id IS NOT NULL AND player2_id IS NULL THEN v_winner_id ELSE player2_id END
    WHERE id = v_match.next_match_id
      AND (player1_id IS NULL OR player2_id IS NULL);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_ranking_playoff_result(uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_ranking_playoff_result(uuid, integer, integer, integer, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION save_ranking_playoff_result(uuid, integer, integer, integer, integer, integer, integer) TO authenticated;
