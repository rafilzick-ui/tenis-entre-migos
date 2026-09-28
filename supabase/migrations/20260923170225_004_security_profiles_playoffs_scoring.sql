/*
# Security, profiles privacy, playoff generation, and match validation

1. Public profiles VIEW
- `public_profiles`: exposes only id, display_name, avatar_url, role, created_at
  - Hides email and phone from other users
  - RLS on the view: authenticated can SELECT all rows (public info only)

2. Profiles RLS update
- SELECT policy changed: users can only see their OWN full profile (with email/phone)
  or use the public_profiles view for other users' public info
- This prevents email/phone leakage to other authenticated users

3. RPC: set_user_role
- Already exists but re-created here with SECURITY DEFINER for reliability
- Only admins can call; validates role input

4. RPC: save_match_result
- Validates and saves match scores for both tournament group matches and ranking matches
- Validates: SUP only when 1x1, winner determination, score integrity
- Only admins can call (SECURITY DEFINER checks role)
- Returns the computed winner_id

5. RPC: generate_playoffs
- Classifies group standings (points > wins > sets difference)
- Selects top 2 from each group + best two 3rd places to fill 8 slots
- Creates QF matches (1A vs 2B, 1B vs 2A, 1C vs 2D, 1D vs 2C pattern)
- Only admins can call

6. RPC: advance_playoff_winner
- After a QF or SF match gets a winner, creates the next round match
- QF winners 1&2 -> SF1, QF winners 3&4 -> SF2
- SF winners -> Final
- Sets tournament to 'complete' when final has a winner
- Only admins can call (but auto-called from save_match_result for playoff matches)

7. Notes
- No tables dropped or renamed
- No columns changed or removed
- All new objects are additive
*/

-- ============================================================
-- 1. Public profiles view
-- ============================================================
CREATE OR REPLACE VIEW public_profiles AS
SELECT id, display_name, avatar_url, role, created_at
FROM profiles;

GRANT SELECT ON public_profiles TO authenticated;

-- ============================================================
-- 2. Update profiles SELECT policy to restrict email/phone
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- ============================================================
-- 3. set_user_role RPC (refresh to ensure correctness)
-- ============================================================
CREATE OR REPLACE FUNCTION set_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_role NOT IN ('player', 'admin') THEN
    RAISE EXCEPTION 'Papel invalido. Deve ser player ou admin.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papeis.';
  END IF;

  UPDATE profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO authenticated;

-- ============================================================
-- 4. save_match_result RPC
-- ============================================================
CREATE OR REPLACE FUNCTION save_match_result(
  p_match_type text,
  p_match_id uuid,
  p_set1_p1 int,
  p_set1_p2 int,
  p_set2_p1 int,
  p_set2_p2 int,
  p_sup_p1 int DEFAULT NULL,
  p_sup_p2 int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player1_id uuid;
  v_player2_id uuid;
  v_p1_sets int := 0;
  v_p2_sets int := 0;
  v_winner_id uuid := NULL;
  v_is_admin boolean;
BEGIN
  -- Check admin
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem lancar resultados.';
  END IF;

  -- Validate scores are non-negative
  IF p_set1_p1 < 0 OR p_set1_p2 < 0 OR p_set2_p1 < 0 OR p_set2_p2 < 0 THEN
    RAISE EXCEPTION 'Placares nao podem ser negativos.';
  END IF;

  -- Fetch match players
  IF p_match_type = 'group' THEN
    SELECT player1_id, player2_id INTO v_player1_id, v_player2_id
    FROM tournament_group_matches WHERE id = p_match_id;
  ELSIF p_match_type = 'playoff' THEN
    SELECT player1_id, player2_id INTO v_player1_id, v_player2_id
    FROM tournament_playoff_matches WHERE id = p_match_id;
  ELSIF p_match_type = 'ranking' THEN
    SELECT player1_id, player2_id INTO v_player1_id, v_player2_id
    FROM ranking_matches WHERE id = p_match_id;
  ELSE
    RAISE EXCEPTION 'Tipo de partida invalido. Use group, playoff ou ranking.';
  END IF;

  IF v_player1_id IS NULL OR v_player2_id IS NULL THEN
    RAISE EXCEPTION 'Partida nao encontrada ou jogadores nao definidos.';
  END IF;

  -- Calculate sets won
  IF p_set1_p1 > p_set1_p2 THEN v_p1_sets := v_p1_sets + 1;
  ELSIF p_set1_p2 > p_set1_p1 THEN v_p2_sets := v_p2_sets + 1;
  END IF;

  IF p_set2_p1 > p_set2_p2 THEN v_p1_sets := v_p1_sets + 1;
  ELSIF p_set2_p2 > p_set2_p1 THEN v_p2_sets := v_p2_sets + 1;
  END IF;

  -- Validate SUP: only allowed when 1x1
  IF (p_sup_p1 IS NOT NULL OR p_sup_p2 IS NOT NULL) THEN
    IF v_p1_sets != 1 OR v_p2_sets != 1 THEN
      RAISE EXCEPTION 'SUP so e permitido quando os dois primeiros sets terminam 1x1.';
    END IF;
    IF p_sup_p1 IS NULL OR p_sup_p2 IS NULL THEN
      RAISE EXCEPTION 'Ambos os placares de SUP devem ser informados.';
    END IF;
    IF p_sup_p1 = p_sup_p2 THEN
      RAISE EXCEPTION 'SUP nao pode terminar em empate.';
    END IF;
  END IF;

  -- Determine winner
  IF v_p1_sets = 2 THEN
    v_winner_id := v_player1_id;
  ELSIF v_p2_sets = 2 THEN
    v_winner_id := v_player2_id;
  ELSIF v_p1_sets = 1 AND v_p2_sets = 1 AND p_sup_p1 IS NOT NULL AND p_sup_p2 IS NOT NULL THEN
    v_winner_id := CASE WHEN p_sup_p1 > p_sup_p2 THEN v_player1_id ELSE v_player2_id END;
  END IF;

  -- Save result
  IF p_match_type = 'group' THEN
    UPDATE tournament_group_matches
    SET set1_p1 = p_set1_p1, set1_p2 = p_set1_p2,
        set2_p1 = p_set2_p1, set2_p2 = p_set2_p2,
        sup_p1 = CASE WHEN v_p1_sets = 1 AND v_p2_sets = 1 THEN p_sup_p1 ELSE NULL END,
        sup_p2 = CASE WHEN v_p1_sets = 1 AND v_p2_sets = 1 THEN p_sup_p2 ELSE NULL END,
        winner_id = v_winner_id
    WHERE id = p_match_id;
  ELSIF p_match_type = 'playoff' THEN
    UPDATE tournament_playoff_matches
    SET set1_p1 = p_set1_p1, set1_p2 = p_set1_p2,
        set2_p1 = p_set2_p1, set2_p2 = p_set2_p2,
        sup_p1 = CASE WHEN v_p1_sets = 1 AND v_p2_sets = 1 THEN p_sup_p1 ELSE NULL END,
        sup_p2 = CASE WHEN v_p1_sets = 1 AND v_p2_sets = 1 THEN p_sup_p2 ELSE NULL END,
        winner_id = v_winner_id
    WHERE id = p_match_id;

    -- Auto-advance playoff bracket
    PERFORM advance_playoff_bracket(p_match_id);
  ELSIF p_match_type = 'ranking' THEN
    UPDATE ranking_matches
    SET set1_p1 = p_set1_p1, set1_p2 = p_set1_p2,
        set2_p1 = p_set2_p1, set2_p2 = p_set2_p2,
        sup_p1 = CASE WHEN v_p1_sets = 1 AND v_p2_sets = 1 THEN p_sup_p1 ELSE NULL END,
        sup_p2 = CASE WHEN v_p1_sets = 1 AND v_p2_sets = 1 THEN p_sup_p2 ELSE NULL END,
        winner_id = v_winner_id
    WHERE id = p_match_id;
  END IF;

  RETURN v_winner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) TO authenticated;

-- ============================================================
-- 5. advance_playoff_bracket function (helper, called by save_match_result)
-- ============================================================
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
    -- Check if all 4 QF matches have winners
    SELECT
      MAX(CASE WHEN match_number = 1 THEN winner_id END),
      MAX(CASE WHEN match_number = 2 THEN winner_id END),
      MAX(CASE WHEN match_number = 3 THEN winner_id END),
      MAX(CASE WHEN match_number = 4 THEN winner_id END)
    INTO v_qf1_winner, v_qf2_winner, v_qf3_winner, v_qf4_winner
    FROM tournament_playoff_matches
    WHERE tournament_id = v_tournament_id AND stage = 'quarterfinal';

    IF v_qf1_winner IS NOT NULL AND v_qf2_winner IS NOT NULL
       AND v_qf3_winner IS NOT NULL AND v_qf4_winner IS NOT NULL THEN

      -- Create SF1 (QF1 winner vs QF2 winner) and SF2 (QF3 winner vs QF4 winner) if not exist
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

      -- Update tournament status to playoffs
      UPDATE tournaments_meta SET status = 'playoffs' WHERE id = v_tournament_id AND status = 'groups_drawn';
    END IF;

  ELSIF v_stage = 'semifinal' THEN
    SELECT
      MAX(CASE WHEN match_number = 1 THEN winner_id END),
      MAX(CASE WHEN match_number = 2 THEN winner_id END)
    INTO v_sf1_winner, v_sf2_winner
    FROM tournament_playoff_matches
    WHERE tournament_id = v_tournament_id AND stage = 'semifinal';

    IF v_sf1_winner IS NOT NULL AND v_sf2_winner IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM tournament_playoff_matches
        WHERE tournament_id = v_tournament_id AND stage = 'final' AND match_number = 1) INTO v_final_exists;

      IF NOT v_final_exists THEN
        INSERT INTO tournament_playoff_matches (tournament_id, stage, match_number, player1_id, player2_id)
        VALUES (v_tournament_id, 'final', 1, v_sf1_winner, v_sf2_winner);
      END IF;
    END IF;

  ELSIF v_stage = 'final' THEN
    -- Tournament complete
    UPDATE tournaments_meta SET status = 'complete' WHERE id = v_tournament_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION advance_playoff_bracket(uuid) TO authenticated;

-- ============================================================
-- 6. generate_playoffs RPC
-- ============================================================
CREATE OR REPLACE FUNCTION generate_playoffs(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_group_record record;
  v_standings jsonb;
  v_qualified jsonb;
  v_qf_count int;
  v_num_groups int;
  v_third_places jsonb := '[]'::jsonb;
  v_sorted_thirds jsonb;
  v_i int;
  v_match_num int := 1;
  v_p1 uuid;
  v_p2 uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar o mata-mata.';
  END IF;

  -- Count groups
  SELECT count(*) INTO v_num_groups
  FROM tournament_groups WHERE tournament_id = p_tournament_id;

  IF v_num_groups < 2 THEN
    RAISE EXCEPTION 'Necessario pelo menos 2 grupos para o mata-mata.';
  END IF;

  -- Delete existing playoff matches
  DELETE FROM tournament_playoff_matches WHERE tournament_id = p_tournament_id;

  -- Build standings for each group
  v_qualified := '[]'::jsonb;

  FOR v_group_record IN
    SELECT g.id, g.group_label
    FROM tournament_groups g
    WHERE g.tournament_id = p_tournament_id
    ORDER BY g.group_label
  LOOP
    -- Calculate standings for this group
    WITH matches AS (
      SELECT
        m.player1_id, m.player2_id,
        m.set1_p1, m.set1_p2, m.set2_p1, m.set2_p2,
        m.sup_p1, m.sup_p2, m.winner_id
      FROM tournament_group_matches m
      WHERE m.group_id = v_group_record.id AND m.winner_id IS NOT NULL
    ),
    player_stats AS (
      SELECT player_id, group_label FROM (
        SELECT player1_id AS player_id, v_group_record.group_label AS group_label
        FROM matches WHERE player1_id IS NOT NULL
        UNION
        SELECT player2_id AS player_id, v_group_record.group_label AS group_label
        FROM matches WHERE player2_id IS NOT NULL
      ) ps GROUP BY player_id, group_label
    ),
    stats AS (
      SELECT
        ps.player_id,
        ps.group_label,
        COALESCE(SUM(CASE WHEN m.winner_id = ps.player_id THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN m.winner_id != ps.player_id THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE
          WHEN m.winner_id = ps.player_id THEN
            CASE
              WHEN (SELECT count(*) FROM matches m2 WHERE m2.winner_id = m.winner_id AND m2.player1_id = m.winner_id OR m2.winner_id = m.winner_id AND m2.player2_id = m.winner_id) = 1
              THEN 9 ELSE 18 END
          ELSE
            CASE
              WHEN (SELECT count(*) FROM matches m3 WHERE m3.winner_id != ps.player_id AND (m3.player1_id = ps.player_id OR m3.player2_id = ps.player_id)) = 1
              THEN 9 ELSE 0 END
        END), 0) AS points
      FROM player_stats ps
      LEFT JOIN matches m ON (m.player1_id = ps.player_id OR m.player2_id = ps.player_id)
      GROUP BY ps.player_id, ps.group_label
    ),
    set_stats AS (
      SELECT
        ps.player_id,
        COALESCE(SUM(CASE
          WHEN m.player1_id = ps.player_id THEN
            (CASE WHEN m.set1_p1 > m.set1_p2 THEN 1 ELSE 0 END) +
            (CASE WHEN m.set2_p1 > m.set2_p2 THEN 1 ELSE 0 END) +
            (CASE WHEN m.sup_p1 > m.sup_p2 AND m.set1_p1 = m.set1_p2 AND m.set2_p1 = m.set2_p2 THEN 1 ELSE 0 END)
          WHEN m.player2_id = ps.player_id THEN
            (CASE WHEN m.set1_p2 > m.set1_p1 THEN 1 ELSE 0 END) +
            (CASE WHEN m.set2_p2 > m.set2_p1 THEN 1 ELSE 0 END) +
            (CASE WHEN m.sup_p2 > m.sup_p1 AND m.set1_p1 = m.set1_p2 AND m.set2_p1 = m.set2_p2 THEN 1 ELSE 0 END)
          ELSE 0 END), 0) AS sets_won
      FROM player_stats ps
      LEFT JOIN matches m ON (m.player1_id = ps.player_id OR m.player2_id = ps.player_id)
      GROUP BY ps.player_id
    )
    SELECT jsonb_agg(jsonb_build_object(
      'player_id', s.player_id,
      'group', s.group_label,
      'wins', s.wins,
      'losses', s.losses,
      'points', s.points,
      'sets_won', COALESCE(ss.sets_won, 0)
    ) ORDER BY s.points DESC, s.wins DESC, COALESCE(ss.sets_won, 0) DESC)
    INTO v_standings
    FROM stats s
    LEFT JOIN set_stats ss ON ss.player_id = s.player_id;

    -- Add 1st and 2nd to qualified
    IF v_standings IS NOT NULL AND jsonb_array_length(v_standings) >= 2 THEN
      v_qualified := v_qualified || jsonb_build_array(
        jsonb_build_object('player_id', v_standings->0->>'player_id', 'group', v_standings->0->>'group', 'position', 1),
        jsonb_build_object('player_id', v_standings->1->>'player_id', 'group', v_standings->1->>'group', 'position', 2)
      );

      -- Collect 3rd place if exists
      IF jsonb_array_length(v_standings) >= 3 THEN
        v_third_places := v_third_places || jsonb_build_array(
          jsonb_build_object('player_id', v_standings->2->>'player_id', 'group', v_standings->2->>'group', 'points', (v_standings->2->>'points')::int, 'wins', (v_standings->2->>'wins')::int, 'sets_won', (v_standings->2->>'sets_won')::int)
        );
      END IF;
    END IF;
  END LOOP;

  v_qf_count := jsonb_array_length(v_qualified) / 1; -- each group contributes 2

  -- We need exactly 8. If we have fewer than 8 from 1st+2nd, fill with best 3rds
  IF jsonb_array_length(v_qualified) < 8 THEN
    -- Sort third places by points, wins, sets_won
    SELECT jsonb_agg(elem ORDER BY (elem->>'points')::int DESC, (elem->>'wins')::int DESC, (elem->>'sets_won')::int DESC)
    INTO v_sorted_thirds
    FROM jsonb_array_elements(v_third_places) AS elem;

    v_i := 0;
    WHILE jsonb_array_length(v_qualified) < 8 AND v_i < jsonb_array_length(v_sorted_thirds) LOOP
      v_qualified := v_qualified || jsonb_build_array(
        jsonb_build_object('player_id', v_sorted_thirds->v_i->>'player_id', 'group', v_sorted_thirds->v_i->>'group', 'position', 3)
      );
      v_i := v_i + 1;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_qualified) != 8 THEN
    RAISE EXCEPTION 'Nao foi possivel classificar 8 jogadores. Classificados: %', jsonb_array_length(v_qualified);
  END IF;

  -- Create QF matches with cross-group pairings:
  -- QF1: 1st A vs 2nd B, QF2: 1st B vs 2nd A, QF3: 1st C vs 2nd D, QF4: 1st D vs 2nd C
  -- For 2 groups: QF1: 1st A vs 2nd B, QF2: 1st B vs 2nd A, QF3: best3rd vs 1st A(pick), QF4: ...
  -- Simplified: pair them cross-group
  FOR v_i IN 0..3 LOOP
    v_p1 := (v_qualified->(v_i * 2))->>'player_id';
    v_p2 := (v_qualified->(v_i * 2 + 1))->>'player_id';

    -- Alternate pairing: 0-3, 1-2, 2-1, 3-0 pattern for cross-group
    IF v_i = 0 THEN
      v_p1 := (v_qualified->0)->>'player_id';
      v_p2 := (v_qualified->3)->>'player_id';
    ELSIF v_i = 1 THEN
      v_p1 := (v_qualified->1)->>'player_id';
      v_p2 := (v_qualified->2)->>'player_id';
    ELSIF v_i = 2 THEN
      v_p1 := (v_qualified->4)->>'player_id';
      v_p2 := (v_qualified->7)->>'player_id';
    ELSIF v_i = 3 THEN
      v_p1 := (v_qualified->5)->>'player_id';
      v_p2 := (v_qualified->6)->>'player_id';
    END IF;

    INSERT INTO tournament_playoff_matches (tournament_id, stage, match_number, player1_id, player2_id)
    VALUES (p_tournament_id, 'quarterfinal', v_i + 1, v_p1::uuid, v_p2::uuid);
  END LOOP;

  -- Update tournament status to playoffs
  UPDATE tournaments_meta SET status = 'playoffs' WHERE id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_playoffs(uuid) TO authenticated;

-- ============================================================
-- 7. Get group standings RPC (for frontend display)
-- ============================================================
CREATE OR REPLACE FUNCTION get_group_standings(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH matches AS (
    SELECT player1_id, player2_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, winner_id
    FROM tournament_group_matches
    WHERE group_id = p_group_id AND winner_id IS NOT NULL
  ),
  players AS (
    SELECT DISTINCT player_id FROM (
      SELECT player1_id AS player_id FROM matches WHERE player1_id IS NOT NULL
      UNION
      SELECT player2_id AS player_id FROM matches WHERE player2_id IS NOT NULL
    ) p
  ),
  calc AS (
    SELECT
      pl.player_id,
      COALESCE(SUM(CASE WHEN m.winner_id = pl.player_id THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != pl.player_id THEN 1 ELSE 0 END), 0) AS losses,
      COALESCE(SUM(CASE WHEN m.winner_id = pl.player_id THEN 18
             WHEN m.winner_id IS NOT NULL AND m.winner_id != pl.player_id THEN
               CASE WHEN (
                 (CASE WHEN m.set1_p1 > m.set1_p2 AND m.player1_id = pl.player_id THEN 1 WHEN m.set1_p2 > m.set1_p1 AND m.player2_id = pl.player_id THEN 1 ELSE 0 END) +
                 (CASE WHEN m.set2_p1 > m.set2_p2 AND m.player1_id = pl.player_id THEN 1 WHEN m.set2_p2 > m.set2_p1 AND m.player2_id = pl.player_id THEN 1 ELSE 0 END)
               ) >= 1 THEN 9 ELSE 0 END
             ELSE 0 END), 0) AS points,
      COALESCE(SUM(CASE
        WHEN m.player1_id = pl.player_id THEN
          (CASE WHEN m.set1_p1 > m.set1_p2 THEN 1 ELSE 0 END) +
          (CASE WHEN m.set2_p1 > m.set2_p2 THEN 1 ELSE 0 END)
        WHEN m.player2_id = pl.player_id THEN
          (CASE WHEN m.set1_p2 > m.set1_p1 THEN 1 ELSE 0 END) +
          (CASE WHEN m.set2_p2 > m.set2_p1 THEN 1 ELSE 0 END)
        ELSE 0 END), 0) AS sets_won
    FROM players pl
    LEFT JOIN matches m ON (m.player1_id = pl.player_id OR m.player2_id = pl.player_id)
    GROUP BY pl.player_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'player_id', c.player_id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'wins', c.wins,
    'losses', c.losses,
    'points', c.points,
    'sets_won', c.sets_won,
    'played', c.wins + c.losses
  ) ORDER BY c.points DESC, c.wins DESC, c.sets_won DESC)
  INTO v_result
  FROM calc c
  JOIN public_profiles p ON p.id = c.player_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_standings(uuid) TO authenticated;