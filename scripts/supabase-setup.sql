-- One-time Supabase setup for Taskmana sync.
-- Run in the SQL editor of https://aennreackkegaqwwbowg.supabase.co
--
-- The taskmana_ prefix is deliberate: this Supabase project hosts several
-- apps, so a bare `states` table would be a collision waiting to happen.
-- Safe to re-run.

create table if not exists public.taskmana_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.taskmana_states enable row level security;

-- RLS is the actual security boundary — the anon key in js/config.js is
-- publishable by design. Each user can only ever touch their own row.
drop policy if exists "select own" on public.taskmana_states;
create policy "select own" on public.taskmana_states
  for select using (auth.uid() = user_id);

drop policy if exists "insert own" on public.taskmana_states;
create policy "insert own" on public.taskmana_states
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own" on public.taskmana_states;
create policy "update own" on public.taskmana_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
