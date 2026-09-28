/*
# Tournament 1-set scoring + Ranking match count fix + RLS updates

## Changes

### 1. Remove ranking_matches.match_number CHECK constraint
   - The old constraint `CHECK (match_number IN (1, 2))` capped each round at 2 matches.
   - This caused the "only 2 matches per round" bug in ranking.
   - Replaced with `CHECK (match_number >= 1)` to allow N/2 matches per round.

### 2. New RPC: save_tournament_match_result
   - Tournament matches are now 1 SET only. No Set 2, no SUP.
   - Admin enters: score_p1 (int), score_p2 (int).
   - Winner = higher score. Ties are rejected. Negatives are rejected.
   - Works for both group and playoff tournament matches.
   - The existing save_match_result RPC remains for RANKING matches (2 sets + SUP).

### 3. Updated RPC: get_group_standings
   - Recalculated for 1-set tournament matches.
   - Win = 3 points, Loss = 0 points (simple win/loss, no sets-based scoring).
   - Standings sorted by points DESC, wins DESC.

### 4. Updated RPC: generate_playoffs
   - Updated standings calculation for 1-set tournament matches.

### 5. RLS: Allow players to save their own ranking match results
   - New policy: ranking_matches_player_update — a player can UPDATE a ranking_match
     row if they are player1_id or player2_id.
   - Admins retain full update access via existing policy.
   - This supports the "player launches own result" requirement for ranking.

### 6. RLS: Allow players to view all ranking matches (SELECT stays open)
   - Existing SELECT policy already allows all authenticated to read. No change needed.
   - The "Minhas partidas" filtering is done client-side.

### 7. Tournament group_matches: add player update policy
   - New policy: group_matches_player_update — NOT added. Tournament results are
     admin-only per requirements. Only ranking allows player self-reporting.
*/

-- 1. Remove the old match_number constraint
ALTER TABLE ranking_matches DROP CONSTRAINT IF EXISTS ranking_matches_match_number_check;
ALTER TABLE ranking_matches ADD CONSTRAINT ranking_matches_match_number_check CHECK (match_number >= 1);

-- 2. New RPC for tournament 1-set matches
CREATE OR REPLACE FUNCTION save_tournament_match_result(
  p_match_type text,
  p_match_id uuid,
  p_score_p1 int,
  p_score_p2 int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player1_id uuid;
  v_player2_id uuid;
  v_winner_id uuid := NULL;
  v_is_admin boolean;
BEGIN
  -- Check admin
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem lancar resultados do torneio.';
  END IF;

  -- Validate scores
  IF p_score_p1 < 0 OR p_score_p2 < 0 THEN
    RAISE EXCEPTION 'Placares nao podem ser negativos.';
  END IF;

  IF p_score_p1 = p_score_p2 THEN
    RAISE EXCEPTION 'Empate nao e permitido no torneio. O placar deve ter um vencedor.';
  END IF;

  -- Fetch match players
  IF p_match_type = 'group' THEN
    SELECT player1_id, player2_id INTO v_player1_id, v_player2_id
    FROM tournament_group_matches WHERE id = p_match_id;
  ELSIF p_match_type = 'playoff' THEN
    SELECT player1_id, player2_id INTO v_player1_id, v_player2_id
    FROM tournament_playoff_matches WHERE id = p_match_id;
  ELSE
    RAISE EXCEPTION 'Tipo de partida invalido. Use group ou playoff.';
  END IF;

  IF v_player1_id IS NULL OR v_player2_id IS NULL THEN
    RAISE EXCEPTION 'Partida nao encontrada ou jogadores nao definidos.';
  END IF;

  -- Winner = higher score (1 set only)
  v_winner_id := CASE WHEN p_score_p1 > p_score_p2 THEN v_player1_id ELSE v_player2_id END;

  -- Save result
  IF p_match_type = 'group' THEN
    UPDATE tournament_group_matches
    SET set1_p1 = p_score_p1, set1_p2 = p_score_p2,
        set2_p1 = NULL, set2_p2 = NULL,
        sup_p1 = NULL, sup_p2 = NULL,
        winner_id = v_winner_id
    WHERE id = p_match_id;
  ELSIF p_match_type = 'playoff' THEN
    UPDATE tournament_playoff_matches
    SET set1_p1 = p_score_p1, set1_p2 = p_score_p2,
        set2_p1 = NULL, set2_p2 = NULL,
        sup_p1 = NULL, sup_p2 = NULL,
        winner_id = v_winner_id
    WHERE id = p_match_id;

    -- Auto-advance playoff bracket
    PERFORM advance_playoff_bracket(p_match_id);
  END IF;

  RETURN v_winner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tournament_match_result(text, uuid, int, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION save_tournament_match_result(text, uuid, int, int) FROM anon;

-- 3. Updated get_group_standings for 1-set tournament
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
    SELECT player1_id, player2_id, set1_p1, set1_p2, winner_id
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
      COALESCE(SUM(CASE WHEN m.winner_id = pl.player_id THEN 3 ELSE 0 END), 0) AS points,
      COALESCE(SUM(CASE
        WHEN m.player1_id = pl.player_id THEN m.set1_p1
        WHEN m.player2_id = pl.player_id THEN m.set1_p2
        ELSE 0 END), 0) AS games_won
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
    'sets_won', c.games_won,
    'played', c.wins + c.losses
  ) ORDER BY c.points DESC, c.wins DESC, c.games_won DESC)
  INTO v_result
  FROM calc c
  JOIN public_profiles p ON p.id = c.player_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_standings(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_group_standings(uuid) FROM anon;

-- 4. Updated generate_playoffs for 1-set tournament
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
  v_num_groups int;
  v_third_places jsonb := '[]'::jsonb;
  v_sorted_thirds jsonb;
  v_i int;
  v_p1 uuid;
  v_p2 uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar o mata-mata.';
  END IF;

  SELECT count(*) INTO v_num_groups
  FROM tournament_groups WHERE tournament_id = p_tournament_id;

  IF v_num_groups < 2 THEN
    RAISE EXCEPTION 'Necessario pelo menos 2 grupos para o mata-mata.';
  END IF;

  DELETE FROM tournament_playoff_matches WHERE tournament_id = p_tournament_id;

  v_qualified := '[]'::jsonb;

  FOR v_group_record IN
    SELECT g.id, g.group_label
    FROM tournament_groups g
    WHERE g.tournament_id = p_tournament_id
    ORDER BY g.group_label
  LOOP
    -- 1-set standings: win=3pts, loss=0pts, tiebreak by games_won (set1 score)
    WITH matches AS (
      SELECT m.player1_id, m.player2_id, m.set1_p1, m.set1_p2, m.winner_id
      FROM tournament_group_matches m
      WHERE m.group_id = v_group_record.id AND m.winner_id IS NOT NULL
    ),
    player_stats AS (
      SELECT player_id FROM (
        SELECT player1_id AS player_id FROM matches WHERE player1_id IS NOT NULL
        UNION
        SELECT player2_id AS player_id FROM matches WHERE player2_id IS NOT NULL
      ) ps GROUP BY player_id
    ),
    stats AS (
      SELECT
        ps.player_id,
        COALESCE(SUM(CASE WHEN m.winner_id = ps.player_id THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN m.winner_id != ps.player_id THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN m.winner_id = ps.player_id THEN 3 ELSE 0 END), 0) AS points,
        COALESCE(SUM(CASE
          WHEN m.player1_id = ps.player_id THEN m.set1_p1
          WHEN m.player2_id = ps.player_id THEN m.set1_p2
          ELSE 0 END), 0) AS games_won
      FROM player_stats ps
      LEFT JOIN matches m ON (m.player1_id = ps.player_id OR m.player2_id = ps.player_id)
      GROUP BY ps.player_id
    )
    SELECT jsonb_agg(jsonb_build_object(
      'player_id', s.player_id,
      'group', v_group_record.group_label,
      'wins', s.wins,
      'losses', s.losses,
      'points', s.points,
      'sets_won', s.games_won
    ) ORDER BY s.points DESC, s.wins DESC, s.games_won DESC)
    INTO v_standings
    FROM stats s;

    IF v_standings IS NOT NULL AND jsonb_array_length(v_standings) >= 2 THEN
      v_qualified := v_qualified || jsonb_build_array(
        jsonb_build_object('player_id', v_standings->0->>'player_id', 'group', v_standings->0->>'group', 'position', 1),
        jsonb_build_object('player_id', v_standings->1->>'player_id', 'group', v_standings->1->>'group', 'position', 2)
      );

      IF jsonb_array_length(v_standings) >= 3 THEN
        v_third_places := v_third_places || jsonb_build_array(
          jsonb_build_object('player_id', v_standings->2->>'player_id', 'group', v_standings->2->>'group', 'points', (v_standings->2->>'points')::int, 'wins', (v_standings->2->>'wins')::int, 'sets_won', (v_standings->2->>'sets_won')::int)
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_qualified) < 8 THEN
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

  FOR v_i IN 0..3 LOOP
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

  UPDATE tournaments_meta SET status = 'playoffs' WHERE id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_playoffs(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION generate_playoffs(uuid) FROM anon;

-- 5. RLS: Allow players to update their own ranking matches (self-report results)
DROP POLICY IF EXISTS "ranking_matches_player_update" ON ranking_matches;
CREATE POLICY "ranking_matches_player_update"
  ON ranking_matches FOR UPDATE TO authenticated
  USING (auth.uid() = player1_id OR auth.uid() = player2_id)
  WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);
