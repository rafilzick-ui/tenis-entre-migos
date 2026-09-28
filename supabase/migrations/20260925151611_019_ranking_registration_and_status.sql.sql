/*
# Ranking registration and status system

1. New Tables
- `ranking_registrations` — stores player registration requests for the ranking
  - id (uuid PK)
  - player_id (uuid FK → profiles.id, NOT NULL DEFAULT auth.uid())
  - status (text: 'pending', 'approved', 'rejected'; default 'pending')
  - created_at (timestamptz)
- `ranking_meta` — single-row table for ranking status (not_started / active)
  - id (int PK, always 1)
  - status (text: 'not_started', 'active'; default 'not_started')

2. Security
- RLS enabled on both tables
- ranking_registrations: players can insert their own, select their own, update none; admins can select/update all
- ranking_meta: all authenticated can SELECT; only admins can UPDATE (via RPC)
*/

CREATE TABLE IF NOT EXISTS ranking_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (player_id)
);

ALTER TABLE ranking_registrations ENABLE ROW LEVEL SECURITY;

-- Players can read their own registration
DROP POLICY IF EXISTS "select_own_ranking_reg" ON ranking_registrations;
CREATE POLICY "select_own_ranking_reg" ON ranking_registrations
  FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

-- Players can insert their own registration (only if not already registered — UNIQUE constraint handles dedup)
DROP POLICY IF EXISTS "insert_own_ranking_reg" ON ranking_registrations;
CREATE POLICY "insert_own_ranking_reg" ON ranking_registrations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

-- Admins can read all registrations
DROP POLICY IF EXISTS "admin_select_all_ranking_regs" ON ranking_registrations;
CREATE POLICY "admin_select_all_ranking_regs" ON ranking_registrations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admins can update registration status (approve/reject)
DROP POLICY IF EXISTS "admin_update_ranking_regs" ON ranking_registrations;
CREATE POLICY "admin_update_ranking_regs" ON ranking_registrations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Ranking meta table (single row)
CREATE TABLE IF NOT EXISTS ranking_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'active'))
);

ALTER TABLE ranking_meta ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read ranking status
DROP POLICY IF EXISTS "select_ranking_meta" ON ranking_meta;
CREATE POLICY "select_ranking_meta" ON ranking_meta
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can update ranking meta
DROP POLICY IF EXISTS "admin_update_ranking_meta" ON ranking_meta;
CREATE POLICY "admin_update_ranking_meta" ON ranking_meta
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Insert the single row if it doesn't exist
INSERT INTO ranking_meta (id, status) VALUES (1, 'not_started')
  ON CONFLICT (id) DO NOTHING;

-- RPC: start_ranking (admin only)
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

GRANT EXECUTE ON FUNCTION start_ranking() TO authenticated;
