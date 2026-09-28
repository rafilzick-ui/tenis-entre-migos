-- Fix: MAX() does not work on UUID columns
-- Replace MAX(CASE WHEN match_number = N THEN winner_id END) with subqueries using LIMIT 1

CREATE OR REPLACE FUNCTION advance_playoff_bracket(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_stage text;
  v_match_number int;
  v_winner_id uuid;
  v_qf1_winner uuid; v_qf2_winner uuid; v_qf3_winner uuid; v_qf4_winner uuid;
  v_sf1_exists boolean; v_sf2_exists boolean;
  v_final_exists boolean;
  v_sf1_winner uuid; v_sf2_winner uuid;
BEGIN
  SELECT tournament_id, stage, match_number, winner_id
  INTO v_tournament_id, v_stage, v_match_number, v_winner_id
  FROM tournament_playoff_matches WHERE id = p_match_id;

  IF v_winner_id IS NULL THEN RETURN; END IF;

  IF v_stage = 'quarterfinal' THEN
    -- Get each QF winner using subqueries instead of MAX() on UUID
    SELECT winner_id INTO v_qf1_winner FROM tournament_playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'quarterfinal' AND match_number = 1 LIMIT 1;
    SELECT winner_id INTO v_qf2_winner FROM tournament_playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'quarterfinal' AND match_number = 2 LIMIT 1;
    SELECT winner_id INTO v_qf3_winner FROM tournament_playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'quarterfinal' AND match_number = 3 LIMIT 1;
    SELECT winner_id INTO v_qf4_winner FROM tournament_playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'quarterfinal' AND match_number = 4 LIMIT 1;

    IF v_qf1_winner IS NOT NULL AND v_qf2_winner IS NOT NULL
       AND v_qf3_winner IS NOT NULL AND v_qf4_winner IS NOT NULL THEN

      SELECT EXISTS(SELECT 1 FROM tournament_playoff_matches
        WHERE tournament_id = v_tournament_id AND stage = 'semifinal' AND match_number = 1) INTO v_sf1_exists;
      SELECT EXISTS(SELECT 1 FROM tournament_playoff_matches
        WHERE tournament_id = v_tournament_id AND stage = 'semifinal' AND match_number = 2) INTO v_sf2_exists;

      IF NOT v_sf1_exists THEN
        INSERT INTO tournament_playoff_matches (tournament_id, stage, match_number, player1_id, player2_id)
        VALUES (v_tournament_id, 'semifinal', 1, v_qf1_winner, v_qf2_winner);
      END IF;

      IF NOT v_sf2_exists THEN
        INSERT INTO tournament_playoff_matches (tournament_id, stage, match_number, player1_id, player2_id)
        VALUES (v_tournament_id, 'semifinal', 2, v_qf3_winner, v_qf4_winner);
      END IF;

      UPDATE tournaments_meta SET status = 'playoffs' WHERE id = v_tournament_id AND status = 'groups_drawn';
    END IF;

  ELSIF v_stage = 'semifinal' THEN
    SELECT winner_id INTO v_sf1_winner FROM tournament_playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'semifinal' AND match_number = 1 LIMIT 1;
    SELECT winner_id INTO v_sf2_winner FROM tournament_playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'semifinal' AND match_number = 2 LIMIT 1;

    IF v_sf1_winner IS NOT NULL AND v_sf2_winner IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM tournament_playoff_matches
        WHERE tournament_id = v_tournament_id AND stage = 'final' AND match_number = 1) INTO v_final_exists;

      IF NOT v_final_exists THEN
        INSERT INTO tournament_playoff_matches (tournament_id, stage, match_number, player1_id, player2_id)
        VALUES (v_tournament_id, 'final', 1, v_sf1_winner, v_sf2_winner);
      END IF;
    END IF;

  ELSIF v_stage = 'final' THEN
    UPDATE tournaments_meta SET status = 'complete' WHERE id = v_tournament_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION advance_playoff_bracket(uuid) TO authenticated;
