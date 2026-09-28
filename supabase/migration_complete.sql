-- ============================================================================
-- TÊNIS ENTRE AMIGOS — MIGRAÇÃO COMPLETA DO BANCO DE DADOS
-- ============================================================================
-- Este script recria toda a estrutura do banco de dados em um novo projeto
-- Supabase. Execute este script no SQL Editor do novo projeto.
--
-- ORDEM DE EXECUÇÃO:
--   1. Extensões
--   2. Tabelas (com PKs, FKs, constraints, CHECKs, UNIQUEs)
--   3. Índices
--   4. View
--   5. Funções (SECURITY DEFINER)
--   6. Triggers
--   7. Políticas RLS
--   8. Permissões (GRANT/REVOKE)
--   9. Realtime publication
--  10. Storage bucket
--  11. Dados iniciais (ranking_meta)
--
-- NOTA: As funções são criadas na sua versão FINAL (após todas as
-- migrations de correção). As políticas RLS refletem o estado final.
-- ============================================================================

-- ============================================================================
-- 1. EXTENSÕES
-- ============================================================================
-- pgcrypto é necessário para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. TABELAS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2.1. tournaments — armazena torneios no formato JSONB (legado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournaments_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- ---------------------------------------------------------------------------
-- 2.2. tournament_edit_secrets — hashes das chaves de edição (server-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_edit_secrets (
  tournament_id uuid PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  edit_key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.3. profiles — dados dos usuários (extende auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  display_name text NOT NULL,
  phone text,
  avatar_url text,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.4. tournaments_meta — metadados dos torneios
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2.5. tournament_registrations — inscrições nos torneios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments_meta(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 2.6. tournament_groups — grupos do round-robin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments_meta(id) ON DELETE CASCADE,
  group_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, group_label)
);

-- ---------------------------------------------------------------------------
-- 2.7. tournament_group_members — membros dos grupos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_position int NOT NULL DEFAULT 0,
  UNIQUE (group_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 2.8. tournament_group_matches — partidas do round-robin
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2.9. tournament_playoff_matches — mata-mata do torneio (QF, SF, Final)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2.10. ranking_rounds — rodadas do ranking (exatamente 4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ranking_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number int NOT NULL CHECK (round_number IN (1, 2, 3, 4)),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_number)
);

-- ---------------------------------------------------------------------------
-- 2.11. ranking_matches — partidas das rodadas de ranking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ranking_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES ranking_rounds(id) ON DELETE CASCADE,
  match_number int NOT NULL CHECK (match_number >= 1),
  player1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set1_p1 int, set1_p2 int, set2_p1 int, set2_p2 int,
  sup_p1 int, sup_p2 int,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, match_number)
);

-- ---------------------------------------------------------------------------
-- 2.12. ranking_match_history — histórico de confrontos do ranking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ranking_match_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id uuid REFERENCES ranking_rounds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.13. ranking_match_byes — byes (folgas) do ranking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ranking_match_byes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES ranking_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 2.14. ranking_playoff_matches — mata-mata do ranking
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2.15. ranking_registrations — inscrições no ranking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ranking_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (player_id)
);

-- ---------------------------------------------------------------------------
-- 2.16. ranking_meta — status do ranking (tabela de linha única)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ranking_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'active'))
);

-- ---------------------------------------------------------------------------
-- 2.17. friendly_matches — amistosos entre jogadores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendly_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenged_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_date date,
  match_time text,
  note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','refused','cancelled','completed')),
  set1_p1 integer,
  set1_p2 integer,
  set2_p1 integer,
  set2_p2 integer,
  sup_p1 integer,
  sup_p2 integer,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_challenge CHECK (challenger_id <> challenged_id),
  CONSTRAINT friendly_matches_match_date_not_past CHECK (match_date IS NULL OR match_date >= CURRENT_DATE)
);

-- ---------------------------------------------------------------------------
-- 2.18. friendly_messages — mensagens dos amistosos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendly_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES friendly_matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.19. notifications — notificações dos usuários
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  ref_id text,
  is_read boolean NOT NULL DEFAULT false,
  dedup_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. ÍNDICES
-- ============================================================================
CREATE INDEX IF NOT EXISTS tournaments_updated_at_idx ON tournaments (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_registrations_player ON tournament_registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON tournament_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_group ON tournament_group_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_playoff_matches_tournament ON tournament_playoff_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_ranking_matches_round ON ranking_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_p1 ON ranking_match_history(player1_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_p2 ON ranking_match_history(player2_id);
CREATE INDEX IF NOT EXISTS idx_ranking_byes_round ON ranking_match_byes(round_id);
CREATE INDEX IF NOT EXISTS idx_ranking_byes_player ON ranking_match_byes(player_id);

CREATE INDEX IF NOT EXISTS idx_friendly_matches_challenger ON friendly_matches(challenger_id);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_challenged ON friendly_matches(challenged_id);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_status ON friendly_matches(status);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_rivalry ON friendly_matches(challenger_id, challenged_id, status);
CREATE INDEX IF NOT EXISTS idx_friendly_messages_match ON friendly_messages(match_id);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_idx
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, is_read, created_at DESC);

-- ============================================================================
-- 4. VIEW
-- ============================================================================
CREATE OR REPLACE VIEW public_profiles AS
SELECT id, display_name, avatar_url, role, created_at
FROM profiles;

ALTER VIEW public_profiles SET (security_invoker = true);
GRANT SELECT ON public_profiles TO authenticated;

-- ============================================================================
-- 5. FUNÇÕES (SECURITY DEFINER) — versões finais após todas as correções
-- ============================================================================

-- 5.1. protect_role_column — trigger: impede alteração de role por não-admins
CREATE OR REPLACE FUNCTION protect_role_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5.2. set_user_role — admin altera papel de um usuário
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

-- 5.3. get_own_profile — retorna o perfil completo do usuário logado
CREATE OR REPLACE FUNCTION get_own_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'display_name', p.display_name,
    'phone', p.phone,
    'avatar_url', p.avatar_url,
    'role', p.role,
    'created_at', p.created_at
  )
  INTO v_result
  FROM profiles p
  WHERE p.id = auth.uid();
  RETURN v_result;
END;
$$;

-- 5.4. create_own_profile — cria perfil do usuário recém-registrado
CREATE OR REPLACE FUNCTION create_own_profile(
  p_email text,
  p_full_name text,
  p_display_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, display_name, phone, role)
  VALUES (auth.uid(), p_email, p_full_name, COALESCE(p_display_name, p_full_name), p_phone, 'player')
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- 5.5. update_own_profile — usuário edita seu próprio perfil
CREATE OR REPLACE FUNCTION update_own_profile(
  p_full_name text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET
    full_name = COALESCE(p_full_name, full_name),
    display_name = COALESCE(p_display_name, display_name),
    phone = COALESCE(p_phone, phone),
    avatar_url = COALESCE(p_avatar_url, avatar_url)
  WHERE id = auth.uid();
END;
$$;

-- 5.6. save_match_result — salva resultado de partidas do RANKING (2 sets + SUP)
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
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem lancar resultados.';
  END IF;

  IF p_set1_p1 < 0 OR p_set1_p2 < 0 OR p_set2_p1 < 0 OR p_set2_p2 < 0 THEN
    RAISE EXCEPTION 'Placares nao podem ser negativos.';
  END IF;

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

  IF p_set1_p1 > p_set1_p2 THEN v_p1_sets := v_p1_sets + 1;
  ELSIF p_set1_p2 > p_set1_p1 THEN v_p2_sets := v_p2_sets + 1;
  END IF;

  IF p_set2_p1 > p_set2_p2 THEN v_p1_sets := v_p1_sets + 1;
  ELSIF p_set2_p2 > p_set2_p1 THEN v_p2_sets := v_p2_sets + 1;
  END IF;

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

  IF v_p1_sets = 2 THEN
    v_winner_id := v_player1_id;
  ELSIF v_p2_sets = 2 THEN
    v_winner_id := v_player2_id;
  ELSIF v_p1_sets = 1 AND v_p2_sets = 1 AND p_sup_p1 IS NOT NULL AND p_sup_p2 IS NOT NULL THEN
    v_winner_id := CASE WHEN p_sup_p1 > p_sup_p2 THEN v_player1_id ELSE v_player2_id END;
  END IF;

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

-- 5.7. save_tournament_match_result — salva resultado de partidas do TORNEIO (1 set)
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
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem lancar resultados do torneio.';
  END IF;

  IF p_score_p1 < 0 OR p_score_p2 < 0 THEN
    RAISE EXCEPTION 'Placares nao podem ser negativos.';
  END IF;

  IF p_score_p1 = p_score_p2 THEN
    RAISE EXCEPTION 'Empate nao e permitido no torneio. O placar deve ter um vencedor.';
  END IF;

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

  v_winner_id := CASE WHEN p_score_p1 > p_score_p2 THEN v_player1_id ELSE v_player2_id END;

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
    PERFORM advance_playoff_bracket(p_match_id);
  END IF;

  RETURN v_winner_id;
END;
$$;

-- 5.8. advance_playoff_bracket — avança o mata-mata do torneio (interno)
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

-- 5.9. generate_playoffs — classifica 8 jogadores e cria o mata-mata do torneio
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

  SELECT jsonb_agg(elem ORDER BY
    (elem->>'points')::int DESC,
    (elem->>'wins')::int DESC,
    (elem->>'games_won')::int DESC,
    elem->>'display_name' ASC
  )
  INTO v_sorted_qualified
  FROM jsonb_array_elements(v_qualified) AS elem;

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

-- 5.10. get_group_standings — classificação de um grupo (1 set)
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

-- 5.11. reset_tournament — reinicia o torneio (admin)
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

-- 5.12. reset_ranking — reinicia o ranking (admin)
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

-- 5.13. delete_player — exclui jogador e todos os seus dados (admin)
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

-- 5.14. create_notification — cria notificação com dedup (admin ou próprio)
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

-- 5.15. generate_ranking_playoffs — gera o mata-mata do ranking (admin)
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
  SELECT (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  INTO v_is_admin;

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

  DELETE FROM ranking_playoff_matches WHERE true;

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

-- 5.16. save_ranking_playoff_result — salva resultado do mata-mata do ranking
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
  SELECT (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  INTO v_is_admin;

  SELECT * INTO v_match FROM ranking_playoff_matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida nao encontrada';
  END IF;

  v_is_player := auth.uid() = v_match.player1_id OR auth.uid() = v_match.player2_id;

  IF NOT v_is_admin AND NOT v_is_player THEN
    RAISE EXCEPTION 'Voce nao tem permissao para editar esta partida';
  END IF;

  IF p_set2_p1 IS NOT NULL AND p_set2_p2 IS NOT NULL THEN
    IF p_set1_p1 > p_set1_p2 AND p_set2_p1 > p_set2_p2 THEN
      v_winner_id := v_match.player1_id;
    ELSIF p_set1_p2 > p_set1_p1 AND p_set2_p2 > p_set2_p1 THEN
      v_winner_id := v_match.player2_id;
    ELSIF p_set1_p1 > p_set1_p2 AND p_set1_p2 > p_set1_p1 THEN
      IF p_sup_p1 IS NOT NULL AND p_sup_p2 IS NOT NULL AND p_sup_p1 > p_sup_p2 THEN
        v_winner_id := v_match.player1_id;
      ELSIF p_sup_p1 IS NOT NULL AND p_sup_p2 IS NOT NULL AND p_sup_p2 > p_sup_p1 THEN
        v_winner_id := v_match.player2_id;
      END IF;
    END IF;
  ELSE
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

  IF v_match.next_match_id IS NOT NULL THEN
    UPDATE ranking_playoff_matches
    SET player1_id = COALESCE(player1_id, v_winner_id),
        player2_id = CASE WHEN player1_id IS NOT NULL AND player2_id IS NULL THEN v_winner_id ELSE player2_id END
    WHERE id = v_match.next_match_id
      AND (player1_id IS NULL OR player2_id IS NULL);
  END IF;
END;
$$;

-- 5.17. start_ranking — admin inicia o ranking
CREATE OR REPLACE FUNCTION start_ranking()
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
    RAISE EXCEPTION 'Apenas administradores podem iniciar o ranking.';
  END IF;

  UPDATE ranking_meta SET status = 'active' WHERE id = 1;
END;
$$;

-- 5.18. fn_friendly_matches_set_updated_at — trigger de updated_at
CREATE OR REPLACE FUNCTION fn_friendly_matches_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================
-- 6.1. profiles: protege a coluna role de alterações por não-admins
DROP TRIGGER IF EXISTS profiles_protect_role ON profiles;
CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_role_column();

-- 6.2. friendly_matches: atualiza updated_at automaticamente
DROP TRIGGER IF EXISTS trg_friendly_matches_updated_at ON friendly_matches;
CREATE TRIGGER trg_friendly_matches_updated_at
  BEFORE UPDATE ON friendly_matches
  FOR EACH ROW
  EXECUTE FUNCTION fn_friendly_matches_set_updated_at();

-- ============================================================================
-- 7. RLS — Row Level Security
-- ============================================================================
-- Habilitar RLS em todas as tabelas
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_edit_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_group_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_playoff_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_match_byes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_playoff_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendly_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendly_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7.1. tournaments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_tournaments" ON tournaments;
CREATE POLICY "anon_select_tournaments"
  ON tournaments FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 7.2. tournament_edit_secrets — sem políticas (bloqueado do browser)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7.3. profiles
-- ---------------------------------------------------------------------------
-- Column-level: revoke full SELECT, grant only public columns
REVOKE SELECT ON profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, role, created_at) ON profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select_public" ON profiles;
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 7.4. tournaments_meta
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tournaments_meta_select" ON tournaments_meta;
CREATE POLICY "tournaments_meta_select" ON tournaments_meta FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tournaments_meta_admin_write" ON tournaments_meta;
CREATE POLICY "tournaments_meta_admin_write" ON tournaments_meta FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "tournaments_meta_admin_update" ON tournaments_meta;
CREATE POLICY "tournaments_meta_admin_update" ON tournaments_meta FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "tournaments_meta_admin_delete" ON tournaments_meta;
CREATE POLICY "tournaments_meta_admin_delete" ON tournaments_meta FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.5. tournament_registrations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "registrations_select" ON tournament_registrations;
CREATE POLICY "registrations_select" ON tournament_registrations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "registrations_insert_own" ON tournament_registrations;
CREATE POLICY "registrations_insert_own" ON tournament_registrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "registrations_delete_own" ON tournament_registrations;
CREATE POLICY "registrations_delete_own" ON tournament_registrations FOR DELETE TO authenticated USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "registrations_admin_update" ON tournament_registrations;
CREATE POLICY "registrations_admin_update" ON tournament_registrations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.6. tournament_groups
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "groups_select" ON tournament_groups;
CREATE POLICY "groups_select" ON tournament_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "groups_admin_write" ON tournament_groups;
CREATE POLICY "groups_admin_write" ON tournament_groups FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "groups_admin_delete" ON tournament_groups;
CREATE POLICY "groups_admin_delete" ON tournament_groups FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.7. tournament_group_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "group_members_select" ON tournament_group_members;
CREATE POLICY "group_members_select" ON tournament_group_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "group_members_admin_write" ON tournament_group_members;
CREATE POLICY "group_members_admin_write" ON tournament_group_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "group_members_admin_delete" ON tournament_group_members;
CREATE POLICY "group_members_admin_delete" ON tournament_group_members FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.8. tournament_group_matches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "group_matches_select" ON tournament_group_matches;
CREATE POLICY "group_matches_select" ON tournament_group_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "group_matches_admin_update" ON tournament_group_matches;
CREATE POLICY "group_matches_admin_update" ON tournament_group_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "group_matches_admin_insert" ON tournament_group_matches;
CREATE POLICY "group_matches_admin_insert" ON tournament_group_matches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.9. tournament_playoff_matches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "playoff_matches_select" ON tournament_playoff_matches;
CREATE POLICY "playoff_matches_select" ON tournament_playoff_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "playoff_matches_admin_update" ON tournament_playoff_matches;
CREATE POLICY "playoff_matches_admin_update" ON tournament_playoff_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "playoff_matches_admin_insert" ON tournament_playoff_matches;
CREATE POLICY "playoff_matches_admin_insert" ON tournament_playoff_matches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.10. ranking_rounds
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ranking_rounds_select" ON ranking_rounds;
CREATE POLICY "ranking_rounds_select" ON ranking_rounds FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_rounds_admin_write" ON ranking_rounds;
CREATE POLICY "ranking_rounds_admin_write" ON ranking_rounds FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_rounds_admin_update" ON ranking_rounds;
CREATE POLICY "ranking_rounds_admin_update" ON ranking_rounds FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_rounds_admin_delete" ON ranking_rounds;
CREATE POLICY "ranking_rounds_admin_delete" ON ranking_rounds FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.11. ranking_matches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ranking_matches_select" ON ranking_matches;
CREATE POLICY "ranking_matches_select" ON ranking_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_matches_admin_update" ON ranking_matches;
CREATE POLICY "ranking_matches_admin_update" ON ranking_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_matches_admin_insert" ON ranking_matches;
CREATE POLICY "ranking_matches_admin_insert" ON ranking_matches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_matches_admin_delete" ON ranking_matches;
CREATE POLICY "ranking_matches_admin_delete" ON ranking_matches FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Player self-report: pode atualizar suas próprias partidas de ranking
DROP POLICY IF EXISTS "ranking_matches_player_update" ON ranking_matches;
CREATE POLICY "ranking_matches_player_update"
  ON ranking_matches FOR UPDATE TO authenticated
  USING (auth.uid() = player1_id OR auth.uid() = player2_id)
  WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);

-- ---------------------------------------------------------------------------
-- 7.12. ranking_match_history
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ranking_history_select" ON ranking_match_history;
CREATE POLICY "ranking_history_select" ON ranking_match_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_history_admin_insert" ON ranking_match_history;
CREATE POLICY "ranking_history_admin_insert" ON ranking_match_history FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_history_admin_delete" ON ranking_match_history;
CREATE POLICY "ranking_history_admin_delete" ON ranking_match_history FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.13. ranking_match_byes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ranking_byes_select" ON ranking_match_byes;
CREATE POLICY "ranking_byes_select" ON ranking_match_byes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ranking_byes_admin_insert" ON ranking_match_byes;
CREATE POLICY "ranking_byes_admin_insert" ON ranking_match_byes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ranking_byes_admin_delete" ON ranking_match_byes;
CREATE POLICY "ranking_byes_admin_delete" ON ranking_match_byes FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.14. ranking_playoff_matches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_ranking_playoffs" ON ranking_playoff_matches;
CREATE POLICY "select_ranking_playoffs" ON ranking_playoff_matches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "update_ranking_playoffs" ON ranking_playoff_matches;
CREATE POLICY "update_ranking_playoffs" ON ranking_playoff_matches
  FOR UPDATE TO authenticated USING (auth.uid() = player1_id OR auth.uid() = player2_id) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7.15. ranking_registrations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_own_ranking_reg" ON ranking_registrations;
CREATE POLICY "select_own_ranking_reg" ON ranking_registrations
  FOR SELECT TO authenticated USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "insert_own_ranking_reg" ON ranking_registrations;
CREATE POLICY "insert_own_ranking_reg" ON ranking_registrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "admin_select_all_ranking_regs" ON ranking_registrations;
CREATE POLICY "admin_select_all_ranking_regs" ON ranking_registrations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_ranking_regs" ON ranking_registrations;
CREATE POLICY "admin_update_ranking_regs" ON ranking_registrations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.16. ranking_meta
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_ranking_meta" ON ranking_meta;
CREATE POLICY "select_ranking_meta" ON ranking_meta
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_ranking_meta" ON ranking_meta;
CREATE POLICY "admin_update_ranking_meta" ON ranking_meta
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 7.17. friendly_matches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_own_friendlies" ON friendly_matches;
CREATE POLICY "select_own_friendlies"
  ON friendly_matches FOR SELECT TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

DROP POLICY IF EXISTS "insert_own_friendlies" ON friendly_matches;
CREATE POLICY "insert_own_friendlies"
  ON friendly_matches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = challenger_id AND auth.uid() <> challenged_id);

DROP POLICY IF EXISTS "update_own_friendlies" ON friendly_matches;
CREATE POLICY "update_own_friendlies"
  ON friendly_matches FOR UPDATE TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = challenged_id)
  WITH CHECK (auth.uid() = challenger_id OR auth.uid() = challenged_id);

DROP POLICY IF EXISTS "delete_own_friendlies" ON friendly_matches;
CREATE POLICY "delete_own_friendlies"
  ON friendly_matches FOR DELETE TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

-- ---------------------------------------------------------------------------
-- 7.18. friendly_messages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_own_friendly_msgs" ON friendly_messages;
CREATE POLICY "select_own_friendly_msgs"
  ON friendly_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM friendly_matches fm
      WHERE fm.id = friendly_messages.match_id
      AND (fm.challenger_id = auth.uid() OR fm.challenged_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_own_friendly_msgs" ON friendly_messages;
CREATE POLICY "insert_own_friendly_msgs"
  ON friendly_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM friendly_matches fm
      WHERE fm.id = friendly_messages.match_id
      AND (fm.challenger_id = auth.uid() OR fm.challenged_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delete_own_friendly_msgs" ON friendly_messages;
CREATE POLICY "delete_own_friendly_msgs"
  ON friendly_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- ---------------------------------------------------------------------------
-- 7.19. notifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- 8. PERMISSÕES (GRANT / REVOKE)
-- ============================================================================

-- Revogar EXECUTE de PUBLIC em todas as funções SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_tournament_match_result(text, uuid, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_playoffs(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_group_standings(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_own_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_own_profile(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_own_profile(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION protect_role_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION advance_playoff_bracket(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_tournament() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_ranking() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_player(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_ranking_playoffs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_ranking_playoff_result(uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION start_ranking() FROM PUBLIC;

-- Revogar de anon também
REVOKE EXECUTE ON FUNCTION set_user_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION save_tournament_match_result(text, uuid, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION generate_playoffs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_group_standings(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_own_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION update_own_profile(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION create_own_profile(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION protect_role_column() FROM anon;
REVOKE EXECUTE ON FUNCTION advance_playoff_bracket(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reset_tournament() FROM anon;
REVOKE EXECUTE ON FUNCTION reset_ranking() FROM anon;
REVOKE EXECUTE ON FUNCTION delete_player(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION generate_ranking_playoffs() FROM anon;
REVOKE EXECUTE ON FUNCTION save_ranking_playoff_result(uuid, integer, integer, integer, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION start_ranking() FROM anon;

-- Conceder EXECUTE para authenticated (exceto advance_playoff_bracket que é interno)
GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION save_tournament_match_result(text, uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_playoffs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_standings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_own_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION update_own_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_own_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_tournament() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_ranking() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ranking_playoffs() TO authenticated;
GRANT EXECUTE ON FUNCTION save_ranking_playoff_result(uuid, integer, integer, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION start_ranking() TO authenticated;

-- ============================================================================
-- 9. REALTIME PUBLICATION
-- ============================================================================
ALTER TABLE tournaments REPLICA IDENTITY FULL;
ALTER TABLE tournaments_meta REPLICA IDENTITY FULL;
ALTER TABLE tournament_group_matches REPLICA IDENTITY FULL;
ALTER TABLE tournament_playoff_matches REPLICA IDENTITY FULL;
ALTER TABLE ranking_matches REPLICA IDENTITY FULL;
ALTER TABLE ranking_rounds REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournaments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
  END IF;
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

-- ============================================================================
-- 10. STORAGE BUCKET
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: usuário pode enviar avatar para a sua própria pasta
DROP POLICY IF EXISTS "avatar_upload_own" ON storage.objects;
CREATE POLICY "avatar_upload_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Update: usuário pode atualizar seu próprio avatar
DROP POLICY IF EXISTS "avatar_update_own" ON storage.objects;
CREATE POLICY "avatar_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read: qualquer pessoa pode ver avatares
DROP POLICY IF EXISTS "avatar_read_public" ON storage.objects;
CREATE POLICY "avatar_read_public"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

-- ============================================================================
-- 11. DADOS INICIAIS
-- ============================================================================
INSERT INTO ranking_meta (id, status) VALUES (1, 'not_started')
  ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
