/*
# Fix admin check: use profiles.role instead of auth.users.raw_app_meta_data

## Problem
Functions from migrations 013, 014, 015, 016, and 020 check admin via:
  auth.jwt() -> 'raw_app_meta_data' ->> 'role' = 'admin'
or:
  raw_app_meta_data->>'role' = 'admin' (from auth.users)

The admin role is NOT stored in raw_app_meta_data. It lives in profiles.role.
This caused all admin functions to fail with "Apenas administradores..." for the real admin.

## Fix
Replace ALL admin checks with:
  EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')

Functions fixed:
- reset_tournament
- reset_ranking
- delete_player
- create_notification
- generate_ranking_playoffs
- set_user_skill_level
- finalize_tournament

## No data changes, no table changes, no destructive operations.
*/

-- ============================================================
-- 1. reset_tournament
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
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem recomecar o torneio';
  END IF;

  DELETE FROM tournament_playoff_matches WHERE true;
  DELETE FROM tournament_group_matches WHERE true;
  DELETE FROM tournament_group_members WHERE true;
  DELETE FROM tournament_groups WHERE true;

  UPDATE tournaments_meta SET status = 'registration', updated_at = now() WHERE true;
END;
$$;

-- ============================================================
-- 2. reset_ranking
-- ============================================================
CREATE OR REPLACE FUNCTION reset_ranking()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem recomecar o ranking';
  END IF;

  DELETE FROM ranking_playoff_matches WHERE true;
  DELETE FROM ranking_match_byes WHERE true;
  DELETE FROM ranking_match_history WHERE true;
  DELETE FROM ranking_matches WHERE true;

  UPDATE ranking_rounds SET status = 'open' WHERE true;
END;
$$;

-- ============================================================
-- 3. delete_player
-- ============================================================
CREATE OR REPLACE FUNCTION delete_player(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir jogadores';
  END IF;

  DELETE FROM friendly_messages WHERE sender_id = p_player_id;
  DELETE FROM friendly_matches WHERE challenger_id = p_player_id OR challenged_id = p_player_id;
  DELETE FROM ranking_playoff_matches WHERE player1_id = p_player_id OR player2_id = p_player_id;
  DELETE FROM ranking_match_byes WHERE player_id = p_player_id;
  DELETE FROM ranking_match_history WHERE player1_id = p_player_id OR player2_id = p_player_id;
  DELETE FROM ranking_matches WHERE player1_id = p_player_id OR player2_id = p_player_id;
  DELETE FROM tournament_playoff_matches WHERE player1_id = p_player_id OR player2_id = p_player_id OR winner_id = p_player_id;
  DELETE FROM tournament_group_matches WHERE player1_id = p_player_id OR player2_id = p_player_id OR winner_id = p_player_id;
  DELETE FROM tournament_group_members WHERE player_id = p_player_id;
  DELETE FROM tournament_registrations WHERE player_id = p_player_id;
  DELETE FROM notifications WHERE user_id = p_player_id;
  DELETE FROM profiles WHERE id = p_player_id;
  DELETE FROM auth.users WHERE id = p_player_id;
END;
$$;

-- ============================================================
-- 4. create_notification
-- ============================================================
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_ref_id text DEFAULT NULL,
  p_dedup_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_caller uuid;
  v_is_admin boolean;
BEGIN
  v_caller := auth.uid();

  IF v_caller = p_user_id THEN
    NULL;
  ELSE
    SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Voce nao tem permissao para criar notificacoes para outros usuarios';
    END IF;
  END IF;

  IF p_dedup_key IS NOT NULL THEN
    SELECT id INTO v_id FROM notifications
      WHERE user_id = p_user_id AND dedup_key = p_dedup_key
      LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link, ref_id, dedup_key)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_ref_id, p_dedup_key)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- 5. generate_ranking_playoffs
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
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta operacao';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'completed')
  INTO v_round_count, v_done_count
  FROM ranking_rounds;

  IF v_round_count < 4 THEN
    RAISE EXCEPTION 'As 4 rodadas do ranking ainda nao foram criadas';
  END IF;

  IF v_done_count < 4 THEN
    RAISE EXCEPTION 'Nem todas as 4 rodadas estao concluidas (% de 4)', v_done_count;
  END IF;

  DELETE FROM ranking_playoff_matches;

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

  IF v_player_count <= 8 THEN
    v_classify_count := 4;
  ELSE
    v_classify_count := 8;
  END IF;

  IF v_classify_count = 4 THEN
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

-- ============================================================
-- 6. set_user_skill_level
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
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;

  IF NOT v_is_admin THEN
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

-- ============================================================
-- 7. finalize_tournament
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
  v_is_admin boolean;
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
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
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

-- Re-grant privileges (idempotent)
GRANT EXECUTE ON FUNCTION reset_tournament() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_ranking() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ranking_playoffs() TO authenticated;
GRANT EXECUTE ON FUNCTION set_user_skill_level(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_tournament(uuid) TO authenticated;
