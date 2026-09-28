/*
# Create profiles table for user accounts

1. New Table
- `profiles`: extends Supabase Auth users with app-specific data.
  - `id` (uuid PK, references auth.users ON DELETE CASCADE)
  - `email` (text, not null — mirrors auth.users.email for convenience)
  - `full_name` (text, not null)
  - `display_name` (text, not null — shown in tournaments and rankings)
  - `phone` (text, nullable)
  - `avatar_url` (text, nullable — public URL from Supabase Storage)
  - `role` (text, not null, default 'player' — 'player' or 'admin')
  - `created_at` (timestamptz, default now())

2. Security
- RLS enabled.
- SELECT: any authenticated user can view profiles (needed for tournament participants, rankings).
- INSERT: a user can only insert their own profile (auth.uid() = id).
- UPDATE: a user can only update their own profile. The `role` column is NOT user-editable
  via the standard UPDATE policy — only an admin can change roles, done via a SECURITY DEFINER function.
- DELETE: a user can only delete their own profile.

3. Role protection
- A trigger prevents non-admin users from changing the `role` column.
- A SECURITY DEFINER function `set_user_role` allows admins to promote/demote users.
*/

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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Trigger: prevent non-admin users from changing the role column
CREATE OR REPLACE FUNCTION protect_role_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role ON profiles;
CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_role_column();

-- SECURITY DEFINER function: admin can set any user's role
CREATE OR REPLACE FUNCTION set_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_role NOT IN ('player', 'admin') THEN
    RAISE EXCEPTION 'Invalid role. Must be player or admin.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can change user roles.';
  END IF;

  UPDATE profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO authenticated;

-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
DROP POLICY IF EXISTS "avatar_upload_own" ON storage.objects;
CREATE POLICY "avatar_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_update_own" ON storage.objects;
CREATE POLICY "avatar_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read for avatars
DROP POLICY IF EXISTS "avatar_read_public" ON storage.objects;
CREATE POLICY "avatar_read_public"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');
