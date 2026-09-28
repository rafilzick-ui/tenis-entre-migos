/*
# Create notifications table, fix reset_tournament, add reset_ranking and delete_player functions

## 1. New Table: notifications
- `id` (uuid, primary key)
- `user_id` (uuid, not null — the recipient of the notification)
- `type` (text, not null — e.g. 'friendly_challenge', 'ranking_round', 'friendly_response', 'friendly_cancelled', 'match_result')
- `title` (text, not null)
- `body` (text — optional description)
- `link` (text — optional URL path to navigate to)
- `ref_id` (text — optional reference to the related entity, e.g. match_id or round_id)
- `is_read` (boolean, default false)
- `dedup_key` (text — optional unique key to prevent duplicate notifications for the same event)
- `created_at` (timestamptz, default now())

## 2. Security — RLS on notifications
- Each authenticated user can only SELECT, INSERT (for themselves), UPDATE (mark as read), and DELETE their own notifications.
- All policies use `auth.uid() = user_id`.
- A unique index on (user_id, dedup_key) where dedup_key IS NOT NULL prevents duplicate notifications.

## 3. Fix: reset_tournament function
- The existing function used bare `DELETE FROM <table>` without WHERE clauses, causing "DELETE requires a WHERE clause" error.
- Fixed by adding `WHERE true` to all DELETE statements.

## 4. New: reset_ranking function
- SECURITY DEFINER function callable only by admins.
- Clears all ranking data: ranking_matches, ranking_match_history, ranking_match_byes, ranking_playoff_matches.
- Resets all ranking_rounds status to 'open'.

## 5. New: delete_player function
- SECURITY DEFINER function callable only by admins.
- Deletes a player and all their related data across all tables.
- All DELETEs have explicit WHERE clauses targeting only the specified player.

## 6. New: create_notification helper function
- SECURITY DEFINER function to insert a notification with dedup protection.
- Checks if a notification with the same (user_id, dedup_key) already exists before inserting.
*/

-- =============================================================
-- 1. NOTIFICATIONS TABLE
-- =============================================================

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

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_idx
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, is_read, created_at DESC);

-- RLS Policies: each user can only access their own notifications
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

-- =============================================================
-- 2. FIX: reset_tournament function
-- =============================================================

CREATE OR REPLACE FUNCTION reset_tournament()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() ->> 'raw_app_meta_data' ->> 'role') = 'admin'
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

REVOKE ALL ON FUNCTION reset_tournament() FROM PUBLIC;
REVOKE ALL ON FUNCTION reset_tournament() FROM anon;
GRANT EXECUTE ON FUNCTION reset_tournament() TO authenticated;

-- =============================================================
-- 3. NEW: reset_ranking function
-- =============================================================

CREATE OR REPLACE FUNCTION reset_ranking()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() ->> 'raw_app_meta_data' ->> 'role') = 'admin'
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

REVOKE ALL ON FUNCTION reset_ranking() FROM PUBLIC;
REVOKE ALL ON FUNCTION reset_ranking() FROM anon;
GRANT EXECUTE ON FUNCTION reset_ranking() TO authenticated;

-- =============================================================
-- 4. NEW: delete_player function
-- =============================================================

CREATE OR REPLACE FUNCTION delete_player(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (auth.jwt() ->> 'raw_app_meta_data' ->> 'role') = 'admin'
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

REVOKE ALL ON FUNCTION delete_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_player(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION delete_player(uuid) TO authenticated;

-- =============================================================
-- 5. NEW: create_notification helper function
-- =============================================================

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
BEGIN
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

REVOKE ALL ON FUNCTION create_notification(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_notification(uuid, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, text, text) TO authenticated;
