-- Fix: create_notification should only allow creating notifications for yourself
-- unless you're an admin (for system-level notifications like ranking rounds)
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
  
  -- Allow if creating for yourself, or if you're an admin
  IF v_caller = p_user_id THEN
    NULL; -- allowed
  ELSE
    SELECT (auth.jwt() ->> 'raw_app_meta_data' ->> 'role') = 'admin' INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Voce nao tem permissao para criar notificacoes para outros usuarios';
    END IF;
  END IF;

  -- Check for duplicate if dedup_key is provided
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
