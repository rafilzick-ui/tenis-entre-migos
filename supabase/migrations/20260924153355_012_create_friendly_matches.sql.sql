/*
# Create Friendly Matches (Amistosos) module

## Overview
Adds a completely separate "Amistosos" (friendly matches) module that lets authenticated
players challenge each other to informal tennis matches. This data is 100% isolated from
the official Ranking and Tournament modules — no shared tables, no shared scoring functions.

## New Tables

### 1. friendly_matches
Stores each friendly match / challenge between two players.
- id (uuid PK)
- challenger_id (uuid, FK auth.users) — the player who sent the challenge
- challenged_id (uuid, FK auth.users) — the player who received the challenge
- match_date (date) — scheduled date
- match_time (text) — scheduled time (e.g. "19:00")
- note (text, nullable) — optional observation / location
- status (text) — one of: pending, accepted, refused, cancelled, completed
- set1_p1 (int, nullable) — set 1 score for challenger
- set1_p2 (int, nullable) — set 1 score for challenged
- set2_p1 (int, nullable) — set 2 score for challenger
- set2_p2 (int, nullable) — set 2 score for challenged
- sup_p1 (int, nullable) — tiebreak sup for challenger
- sup_p2 (int, nullable) — tiebreak sup for challenged
- winner_id (uuid, nullable, FK auth.users) — computed winner
- created_at (timestamptz)
- updated_at (timestamptz)

### 2. friendly_messages
Private messages between the two participants of a friendly match.
- id (uuid PK)
- match_id (uuid, FK friendly_matches ON DELETE CASCADE)
- sender_id (uuid, FK auth.users)
- body (text)
- created_at (timestamptz)

## Security (RLS)
Both tables have RLS enabled with policies scoped to `authenticated`.
Only the two participants (challenger_id and challenged_id) of a match can:
- SELECT the match and its messages
- INSERT messages
- UPDATE the match (accept/refuse/cancel/register result)
- DELETE the match (cancel)

Player search uses the existing `public_profiles` table (already has SELECT policy).

## Indexes
- friendly_matches(challenger_id) — my sent challenges
- friendly_matches(challenged_id) — my received challenges
- friendly_matches(status) — filter by pending/accepted/completed
- friendly_matches(challenger_id, challenged_id, status) — rivalry query
- friendly_messages(match_id) — messages for a match
*/

-- ========================================================
-- friendly_matches
-- ========================================================
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
  CONSTRAINT no_self_challenge CHECK (challenger_id <> challenged_id)
);

ALTER TABLE friendly_matches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_friendly_matches_challenger ON friendly_matches(challenger_id);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_challenged ON friendly_matches(challenged_id);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_status ON friendly_matches(status);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_rivalry ON friendly_matches(challenger_id, challenged_id, status);

-- SELECT: both participants can see the match
DROP POLICY IF EXISTS "select_own_friendlies" ON friendly_matches;
CREATE POLICY "select_own_friendlies"
ON friendly_matches FOR SELECT
TO authenticated
USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

-- INSERT: only the challenger can create (challenger_id must be self)
DROP POLICY IF EXISTS "insert_own_friendlies" ON friendly_matches;
CREATE POLICY "insert_own_friendlies"
ON friendly_matches FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = challenger_id AND auth.uid() <> challenged_id);

-- UPDATE: both participants can update (accept/refuse/cancel/result)
DROP POLICY IF EXISTS "update_own_friendlies" ON friendly_matches;
CREATE POLICY "update_own_friendlies"
ON friendly_matches FOR UPDATE
TO authenticated
USING (auth.uid() = challenger_id OR auth.uid() = challenged_id)
WITH CHECK (auth.uid() = challenger_id OR auth.uid() = challenged_id);

-- DELETE: both participants can delete (cancel)
DROP POLICY IF EXISTS "delete_own_friendlies" ON friendly_matches;
CREATE POLICY "delete_own_friendlies"
ON friendly_matches FOR DELETE
TO authenticated
USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

-- ========================================================
-- friendly_messages
-- ========================================================
CREATE TABLE IF NOT EXISTS friendly_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES friendly_matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE friendly_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_friendly_messages_match ON friendly_messages(match_id);

-- SELECT: only participants of the parent match can read messages
DROP POLICY IF EXISTS "select_own_friendly_msgs" ON friendly_messages;
CREATE POLICY "select_own_friendly_msgs"
ON friendly_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM friendly_matches fm
    WHERE fm.id = friendly_messages.match_id
    AND (fm.challenger_id = auth.uid() OR fm.challenged_id = auth.uid())
  )
);

-- INSERT: only participants can send messages, sender must be self
DROP POLICY IF EXISTS "insert_own_friendly_msgs" ON friendly_messages;
CREATE POLICY "insert_own_friendly_msgs"
ON friendly_messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM friendly_matches fm
    WHERE fm.id = friendly_messages.match_id
    AND (fm.challenger_id = auth.uid() OR fm.challenged_id = auth.uid())
  )
);

-- DELETE: sender can delete own message
DROP POLICY IF EXISTS "delete_own_friendly_msgs" ON friendly_messages;
CREATE POLICY "delete_own_friendly_msgs"
ON friendly_messages FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);

-- ========================================================
-- updated_at trigger
-- ========================================================
CREATE OR REPLACE FUNCTION fn_friendly_matches_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendly_matches_updated_at ON friendly_matches;
CREATE TRIGGER trg_friendly_matches_updated_at
  BEFORE UPDATE ON friendly_matches
  FOR EACH ROW
  EXECUTE FUNCTION fn_friendly_matches_set_updated_at();
