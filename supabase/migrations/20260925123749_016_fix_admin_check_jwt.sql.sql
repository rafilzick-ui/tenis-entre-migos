-- Fix admin check in all three SECURITY DEFINER functions
-- The bug: auth.jwt() ->> 'raw_app_meta_data' returns text, not jsonb
-- Fix: use -> (jsonb) for the first level, then ->> (text) for the leaf

CREATE OR REPLACE FUNCTION reset_tournament()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  INTO v_is_admin;
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

CREATE OR REPLACE FUNCTION reset_ranking()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  INTO v_is_admin;
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

CREATE OR REPLACE FUNCTION delete_player(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  INTO v_is_admin;
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

-- Also fix create_notification which has the same pattern
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
    SELECT (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin' INTO v_is_admin;
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

REVOKE ALL ON FUNCTION reset_tournament() FROM PUBLIC;
REVOKE ALL ON FUNCTION reset_tournament() FROM anon;
GRANT EXECUTE ON FUNCTION reset_tournament() TO authenticated;

REVOKE ALL ON FUNCTION reset_ranking() FROM PUBLIC;
REVOKE ALL ON FUNCTION reset_ranking() FROM anon;
GRANT EXECUTE ON FUNCTION reset_ranking() TO authenticated;

REVOKE ALL ON FUNCTION delete_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_player(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION delete_player(uuid) TO authenticated;

REVOKE ALL ON FUNCTION create_notification(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_notification(uuid, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, text, text) TO authenticated;
