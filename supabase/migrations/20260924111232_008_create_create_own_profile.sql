/*
# Create create_own_profile RPC

1. New Function: create_own_profile
- Called during signup to create a profile row for the newly registered user
- SECURITY DEFINER to bypass column-level GRANT restrictions
- Only creates a row for the calling user (auth.uid())
- Sets role to 'player' by default
- Accepts email, full_name, display_name, phone

2. Notes
- No tables changed
- No data changes
*/

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

GRANT EXECUTE ON FUNCTION create_own_profile(text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION create_own_profile(text, text, text, text) FROM anon;
