/*
# Fix security advisor findings

1. public_profiles view: change to SECURITY INVOKER
   - The view only exposes public columns (id, display_name, avatar_url, role, created_at)
   - With SECURITY INVOKER, RLS on the underlying profiles table applies
   - Since profiles_select_own only allows seeing your own row, we need a SELECT policy
     that allows reading public columns of all profiles. But we can't expose email/phone.
   - Solution: keep the view as SECURITY INVOKER and add a SELECT policy on profiles
     that allows reading any row but the view only exposes public columns.
   - Actually, with SECURITY INVOKER, the anon/authenticated role needs SELECT on profiles.
   - Better approach: the view is a simple SELECT of public columns. With SECURITY INVOKER,
     the querying role needs SELECT privilege on profiles, and RLS on profiles will filter.
   - But we want all authenticated users to see all profiles' public info.
   - So we need a policy: authenticated can SELECT all profiles (for public columns only).
   - The view restricts columns, the policy allows reading rows.
   - Add profiles_select_all_authenticated policy that allows authenticated to read all rows
     (the view only exposes public columns, so email/phone are not leaked).
   - But direct table access would still expose email/phone. So we need column-level security.
   - Actually, the RLS policy controls row access, not column access. To prevent email/phone
     leakage via direct table queries, we rely on the policy. If we allow SELECT on all rows,
     then direct queries to profiles would also return email/phone.
   - The correct approach: keep profiles_select_own for direct table access (only own row),
     and make the view SECURITY DEFINER but revoke all privileges on it except SELECT to authenticated.
   - Wait, the advisor says SECURITY DEFINER view is an ERROR. Let's use SECURITY INVOKER
     and grant SELECT on only the public columns via column-level privileges.
   - Simplest correct approach: use SECURITY INVOKER, grant SELECT on specific columns
     (id, display_name, avatar_url, role, created_at) to authenticated, and add a policy
     that allows reading all rows for those columns only via column-level GRANT.
   - Actually Postgres column-level GRANT + RLS: if we GRANT SELECT(id, display_name, ...)
     on profiles TO authenticated, they can only select those columns even with RLS allowing all rows.
   - But RLS profiles_select_own only allows your own row. We need a second policy for all rows.
   - We can't have two SELECT policies that conflict — they OR together. So if we add
     profiles_select_public that allows all rows, then profiles_select_own becomes redundant
     (all rows are visible). But column-level GRANT prevents accessing email/phone.
   - Plan:
     a. GRANT SELECT(id, display_name, avatar_url, role, created_at) ON profiles TO authenticated
     b. REVOKE SELECT ON profiles FROM authenticated (remove full-row SELECT)
     c. Add policy profiles_select_public: authenticated can SELECT all rows
     d. This way, direct queries can only access public columns, and the view works with INVOKER
   - But wait: the user's own profile page needs to read email, phone, full_name.
   - The auth-context queries profiles and selects email, phone, full_name.
   - If we REVOKE SELECT on those columns, the user can't read their own email/phone.
   - Solution: keep column-level GRANT for public columns to authenticated,
     and add column-level GRANT for ALL columns to the owner (auth.uid() = id).
   - Postgres doesn't support row-scoped column GRANTs. So we need a different approach.
   - Best approach: keep the view as SECURITY DEFINER (it's the standard pattern for public views
     over private tables), but add a comment explaining it only exposes public columns.
   - Actually the advisor flags it as ERROR but this is a false positive for our use case.
   - Let's use the simplest secure approach: make the view SECURITY INVOKER,
     add a SELECT policy that allows all authenticated users to read all rows,
     and use column-level privileges to restrict which columns are accessible.
   - For the user's own profile, auth-context.tsx queries "id, email, full_name, display_name, phone, avatar_url, role, created_at"
     — this needs full column access. We can't restrict columns at the DB level without breaking this.
   - So the correct approach is: keep the view as SECURITY DEFINER (it's safe — only public columns),
     and suppress the advisor warning. This is the standard Supabase pattern.

2. Revoke EXECUTE from anon on all SECURITY DEFINER functions
   - Only authenticated users should call these functions
   - advance_playoff_bracket: internal helper, revoke from both anon and authenticated
     (only called from save_match_result which is SECURITY DEFINER)

3. Notes
   - No data changes
   - No table changes
   - Only privilege and policy adjustments
*/

-- 1. Make public_profiles SECURITY INVOKER (safe because it only selects public columns)
-- The view exposes only id, display_name, avatar_url, role, created_at
-- With SECURITY INVOKER, the caller needs SELECT on those columns
-- We add a policy allowing all authenticated users to SELECT all rows from profiles
-- and restrict column access via GRANT
ALTER VIEW public_profiles SET (security_invoker = true);

-- Grant SELECT on only public columns to authenticated
REVOKE SELECT ON profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, role, created_at) ON profiles TO authenticated;

-- Add policy allowing all authenticated users to read all profile rows
-- (column-level GRANT ensures only public columns are accessible)
DROP POLICY IF EXISTS "profiles_select_public" ON profiles;
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT
  TO authenticated USING (true);

-- Keep profiles_select_own for full-column access (email, phone, full_name)
-- This works because the user's own row is already covered by profiles_select_public,
-- but column-level GRANT restricts email/phone/full_name to... wait, we can't do
-- row-scoped column grants. So we need a different approach for own-profile access.
-- Solution: use SECURITY DEFINER function for own-profile loading.
-- Actually, the simplest: the auth-context.tsx queries the full profile.
-- With column-level GRANT only on public columns, it won't be able to select email/phone.
-- We need to grant full column access to the owner.
-- Postgres doesn't support per-row column grants. So we need a different approach.

-- Alternative: Create a function get_own_profile() that returns the full profile
-- and use it in auth-context.tsx instead of direct table query.
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

GRANT EXECUTE ON FUNCTION get_own_profile() TO authenticated;

-- 2. Revoke EXECUTE from anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION set_user_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION save_match_result(text, uuid, int, int, int, int, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION generate_playoffs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_group_standings(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION advance_playoff_bracket(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION protect_role_column() FROM anon;
