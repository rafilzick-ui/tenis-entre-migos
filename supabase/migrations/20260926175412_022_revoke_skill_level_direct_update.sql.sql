/*
# Block direct UPDATE of skill_level by users

The profiles_update_own RLS policy lets users update their own row.
Without column-level restriction, a player could do:
  UPDATE profiles SET skill_level = 10 WHERE id = <self>

Fix: REVOKE UPDATE on skill_level column from authenticated.
The set_user_skill_level() SECURITY DEFINER function bypasses RLS,
so admins can still set it via the RPC.
*/

REVOKE UPDATE (skill_level) ON profiles FROM authenticated;
