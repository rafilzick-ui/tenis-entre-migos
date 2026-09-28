create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  data jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kept in a separate locked table so hashes never appear in public reads or
-- Realtime payloads. Only the server-side Supabase secret key can access it.
create table if not exists public.tournament_edit_secrets (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  edit_key_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.tournament_edit_secrets enable row level security;

revoke all on public.tournaments from anon, authenticated;
revoke all on public.tournament_edit_secrets from anon, authenticated;
grant select on public.tournaments to anon, authenticated;

drop policy if exists "Public tournaments are readable" on public.tournaments;
create policy "Public tournaments are readable"
  on public.tournaments
  for select
  to anon, authenticated
  using (true);

-- No policies are created for tournament_edit_secrets. RLS therefore denies
-- every browser-side request; the server secret role bypasses RLS.

do $$
begin
  alter publication supabase_realtime add table public.tournaments;
exception
  when duplicate_object then null;
end $$;

create index if not exists tournaments_updated_at_idx
  on public.tournaments(updated_at desc);
