/*
# Create update_own_profile RPC

1. New Function: update_own_profile
- Allows authenticated users to update their own full_name, display_name, phone, avatar_url
- SECURITY DEFINER so it bypasses column-level GRANT restrictions
- Only updates the calling user's row
- Does NOT allow changing role, email, or id

2. Notes
- No tables changed
- No data changes
*/

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

GRANT EXECUTE ON FUNCTION update_own_profile(text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION update_own_profile(text, text, text, text) FROM anon;
