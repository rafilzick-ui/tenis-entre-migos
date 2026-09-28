# Tournament Control

A production-ready table tennis tournament tracker built for a full round robin followed by an eight-player knockout bracket.

## What it does

- Any field size from 8–64 players (17 players creates 17 rounds and 136 round-robin matches)
- Round robin BO3, quarterfinals/semifinals BO5, final BO7
- Live leaderboard with deterministic mini-league tiebreaks
- Standard top-eight bracket: 1–8, 4–5, 2–7, 3–6
- Automatic semifinal/final advancement and safe downstream-result invalidation
- Organizer mode protected by a per-tournament edit key
- Public read-only live results through Supabase Realtime, plus polling fallback
- Optimistic revisions and a conflict dialog for simultaneous organizer edits
- Local autosave, JSON export/import, printing, and an offline-only mode
- Compatible with backups exported by the original single-file HTML version

## Stack

- Next.js 16 App Router and Route Handlers
- React 19 and TypeScript
- Tailwind CSS 4
- shadcn/ui component structure with Radix primitives
- Supabase Postgres and Realtime
- Zod validation, Sonner notifications, Lucide icons
- Vitest engine tests

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The complete local-only tournament flow works without Supabase.

## Enable shared live results

1. Create a Supabase project.
2. Open its SQL Editor and run [`supabase/migrations/001_create_tournaments.sql`](supabase/migrations/001_create_tournaments.sql).
3. Copy `.env.example` to `.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SECRET_KEY=sb_secret_your_server_only_key
TOURNAMENT_KEY_PEPPER=a-long-random-server-secret
```

You can find the URL and keys in Supabase → Project Settings → API. Never prefix the secret key with `NEXT_PUBLIC_`.

Restart the dev server, create a tournament, and use **Share live**. The generated `/t/your-slug` page is public and read-only. Organizers unlock editing with the key chosen while publishing.

### Security model

- Browser clients receive `SELECT` access only through Row Level Security.
- All writes go through server Route Handlers using the server-only Supabase secret.
- Edit-key hashes are stored in a separate RLS-locked table and never appear in public rows or Realtime payloads.
- `TOURNAMENT_KEY_PEPPER` strengthens stored hashes if the database is ever exposed.
- Edit keys are kept in `sessionStorage`, so users must enter them again in a new browser session.

For a large public multi-tenant service, add Supabase Auth and rate limiting. The current edit-key design is intentionally simple for a privately operated tournament deployment.

## Deploy to Vercel

1. Push the project to GitHub and import it in Vercel.
2. Add the four environment variables above to Production, Preview, and Development as appropriate.
3. Deploy. No custom build configuration is required.
4. Publish the tournament from the deployed site so its share link uses the production domain.

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The engine tests verify odd/even schedules, all 136 unique pairings for 17 players, score presets, head-to-head ranking, and playoff dependency invalidation.

## Project map

```text
src/app/                         Pages and API Route Handlers
src/components/tournament/       Tournament screens and dialogs
src/components/ui/               shadcn-style UI components
src/lib/tournament.ts             Pure tournament engine
src/lib/tournament-schema.ts      Backup/API runtime validation
src/lib/supabase/                 Browser and server clients
supabase/migrations/              Database, RLS, and Realtime setup
```
