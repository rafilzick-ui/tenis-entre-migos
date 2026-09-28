/*
# Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions

Postgres grants EXECUTE on functions to PUBLIC by default.
The anon role inherits from PUBLIC, so REVOKE FROM anon is insufficient.
Must REVOKE FROM PUBLIC, then GRANT TO authenticated explicitly.

advance_playoff_bracket is an internal helper — revoke from both PUBLIC and authenticated.
*/

REVOKE EXECUTE ON FUNCTION set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_playoffs(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_group_standings(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_own_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_own_profile(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_own_profile(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION protect_role_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION advance_playoff_bracket(uuid) FROM PUBLIC;

-- Re-grant to authenticated (except advance_playoff_bracket which is internal-only)
GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_playoffs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_standings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_own_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION update_own_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_own_profile(text, text, text, text) TO authenticated;
