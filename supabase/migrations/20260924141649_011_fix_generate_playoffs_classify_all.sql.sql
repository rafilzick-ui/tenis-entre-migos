/*
# Fix generate_playoffs: classify 8 players correctly

## Problem
The generate_playoffs function only collected 3rd-place players as wildcards
to fill the bracket to 8. For 2 groups of 4, that produced 4 (top 2 per group)
+ 2 (3rd place per group) = 6, which could never reach 8, causing:
"Nao foi possivel classificar 8 jogadores. Classificados: 6"

## Fix
1. Collect ALL players from ALL groups (not just 3rd place) into a wildcard pool
2. Take top 2 per group as guaranteed qualifiers
3. Fill remaining slots from the wildcard pool sorted by points, wins, games_won, name
4. Re-sort all 8 qualified globally to assign seeds 1-8
5. Create QF matches: 1v8, 4v5, 2v7, 3v6 (standard bracket seeding)

## Tiebreakers (in order)
1. Points (3 per win, 0 per loss)
2. Wins
3. Games won (sum of set1 scores)
4. Display name alphabetical (stable final tiebreaker)

## Functions modified
- generate_playoffs(uuid) — complete rewrite of qualification logic

## No other changes
- advance_playoff_bracket unchanged (SF1=QF1vQF2, SF2=QF3vQF4, Final=SF1vSF2)
- save_tournament_match_result unchanged
- get_group_standings unchanged
- No table/schema changes
- No RLS changes
*/

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
  v_qualified jsonb := '[]'::jsonb;
  v_wildcard_pool jsonb := '[]'::jsonb;
  v_sorted_wildcards jsonb;
  v_sorted_qualified jsonb;
  v_num_groups int;
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
  v_wildcard_pool := '[]'::jsonb;

  FOR v_group_record IN
    SELECT g.id, g.group_label
    FROM tournament_groups g
    WHERE g.tournament_id = p_tournament_id
    ORDER BY g.group_label
  LOOP
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
      'games_won', s.games_won,
      'display_name', p.display_name
    ) ORDER BY s.points DESC, s.wins DESC, s.games_won DESC, p.display_name ASC)
    INTO v_standings
    FROM stats s
    JOIN public_profiles p ON p.id = s.player_id;

    IF v_standings IS NOT NULL AND jsonb_array_length(v_standings) >= 2 THEN
      -- Top 2 from each group are guaranteed qualifiers
      v_qualified := v_qualified || jsonb_build_array(
        jsonb_build_object(
          'player_id', v_standings->0->>'player_id',
          'group', v_standings->0->>'group',
          'points', (v_standings->0->>'points')::int,
          'wins', (v_standings->0->>'wins')::int,
          'games_won', (v_standings->0->>'games_won')::int,
          'display_name', v_standings->0->>'display_name'
        ),
        jsonb_build_object(
          'player_id', v_standings->1->>'player_id',
          'group', v_standings->1->>'group',
          'points', (v_standings->1->>'points')::int,
          'wins', (v_standings->1->>'wins')::int,
          'games_won', (v_standings->1->>'games_won')::int,
          'display_name', v_standings->1->>'display_name'
        )
      );

      -- ALL remaining players (3rd, 4th, etc.) go to wildcard pool
      FOR v_i IN 2..jsonb_array_length(v_standings) - 1 LOOP
        v_wildcard_pool := v_wildcard_pool || jsonb_build_array(
          jsonb_build_object(
            'player_id', v_standings->v_i->>'player_id',
            'group', v_standings->v_i->>'group',
            'points', (v_standings->v_i->>'points')::int,
            'wins', (v_standings->v_i->>'wins')::int,
            'games_won', (v_standings->v_i->>'games_won')::int,
            'display_name', v_standings->v_i->>'display_name'
          )
        );
      END LOOP;
    END IF;
  END LOOP;

  -- Fill remaining slots from wildcard pool (sorted globally)
  IF jsonb_array_length(v_qualified) < 8 THEN
    SELECT jsonb_agg(elem ORDER BY
      (elem->>'points')::int DESC,
      (elem->>'wins')::int DESC,
      (elem->>'games_won')::int DESC,
      elem->>'display_name' ASC
    )
    INTO v_sorted_wildcards
    FROM jsonb_array_elements(v_wildcard_pool) AS elem;

    v_i := 0;
    WHILE jsonb_array_length(v_qualified) < 8
      AND v_sorted_wildcards IS NOT NULL
      AND v_i < jsonb_array_length(v_sorted_wildcards)
    LOOP
      v_qualified := v_qualified || jsonb_build_array(
        jsonb_build_object(
          'player_id', v_sorted_wildcards->v_i->>'player_id',
          'group', v_sorted_wildcards->v_i->>'group',
          'points', (v_sorted_wildcards->v_i->>'points')::int,
          'wins', (v_sorted_wildcards->v_i->>'wins')::int,
          'games_won', (v_sorted_wildcards->v_i->>'games_won')::int,
          'display_name', v_sorted_wildcards->v_i->>'display_name'
        )
      );
      v_i := v_i + 1;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_qualified) != 8 THEN
    RAISE EXCEPTION 'Nao foi possivel classificar 8 jogadores. Classificados: %', jsonb_array_length(v_qualified);
  END IF;

  -- Re-sort all 8 qualified globally to assign seeds 1-8
  SELECT jsonb_agg(elem ORDER BY
    (elem->>'points')::int DESC,
    (elem->>'wins')::int DESC,
    (elem->>'games_won')::int DESC,
    elem->>'display_name' ASC
  )
  INTO v_sorted_qualified
  FROM jsonb_array_elements(v_qualified) AS elem;

  -- QF1: seed1 vs seed8, QF2: seed4 vs seed5, QF3: seed2 vs seed7, QF4: seed3 vs seed6
  FOR v_i IN 0..3 LOOP
    IF v_i = 0 THEN
      v_p1 := (v_sorted_qualified->0)->>'player_id';
      v_p2 := (v_sorted_qualified->7)->>'player_id';
    ELSIF v_i = 1 THEN
      v_p1 := (v_sorted_qualified->3)->>'player_id';
      v_p2 := (v_sorted_qualified->4)->>'player_id';
    ELSIF v_i = 2 THEN
      v_p1 := (v_sorted_qualified->1)->>'player_id';
      v_p2 := (v_sorted_qualified->6)->>'player_id';
    ELSIF v_i = 3 THEN
      v_p1 := (v_sorted_qualified->2)->>'player_id';
      v_p2 := (v_sorted_qualified->5)->>'player_id';
    END IF;

    INSERT INTO tournament_playoff_matches (tournament_id, stage, match_number, player1_id, player2_id)
    VALUES (p_tournament_id, 'quarterfinal', v_i + 1, v_p1::uuid, v_p2::uuid);
  END LOOP;

  UPDATE tournaments_meta SET status = 'playoffs' WHERE id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_playoffs(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION generate_playoffs(uuid) FROM anon;
