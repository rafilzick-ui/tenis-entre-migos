/*
# Create tournaments and edit secrets tables

1. New Tables
- `tournaments`: stores tournament state as a JSONB blob with slug, name, revision, timestamps.
- `tournament_edit_secrets`: stores the hashed edit key for each tournament (server-only access).

2. Security
- RLS enabled on both tables.
- `tournaments`: public SELECT (anyone can view live results), no INSERT/UPDATE/DELETE via browser (all writes go through the edge function with service role).
- `tournament_edit_secrets`: no policies — completely locked from browser access. Only the server/edge function with service role can read/write.

3. Realtime
- `tournaments` table added to `supabase_realtime` publication for live updates.
*/

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournaments_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tournaments" ON tournaments;
CREATE POLICY "anon_select_tournaments"
  ON tournaments FOR SELECT
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS tournaments_updated_at_idx ON tournaments (updated_at DESC);

CREATE TABLE IF NOT EXISTS tournament_edit_secrets (
  tournament_id uuid PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  edit_key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournament_edit_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE tournaments REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournaments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
  END IF;
END $$;
