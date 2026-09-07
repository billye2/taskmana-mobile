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

-- Email allowlist. auth.users is project-wide, so anyone signed up for any
-- app in this project can sign into Taskmana; without this they'd each get
-- an (empty) row. The table has RLS on and no policies, so it is invisible
-- through the API — only the SQL editor / service role can read or edit it.
-- The emails themselves are NOT in this file (the repo is public): after
-- running this script, insert yours in the SQL editor:
--
--   insert into public.taskmana_allowed_emails (email)
--     values ('you@example.com') on conflict do nothing;
create table if not exists public.taskmana_allowed_emails (
  email text primary key
);

alter table public.taskmana_allowed_emails enable row level security;

-- security definer so the policy check can read the allowlist table, which
-- the authenticated role otherwise cannot. Case-insensitive on purpose.
create or replace function public.taskmana_email_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.taskmana_allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.taskmana_email_allowed() from public;
grant execute on function public.taskmana_email_allowed() to authenticated;

-- RLS is the actual security boundary — the anon key in js/config.js is
-- publishable by design. Each user can only ever touch their own row, and
-- only if their email is on the allowlist.
drop policy if exists "select own" on public.taskmana_states;
create policy "select own" on public.taskmana_states
  for select using (auth.uid() = user_id and public.taskmana_email_allowed());

drop policy if exists "insert own" on public.taskmana_states;
create policy "insert own" on public.taskmana_states
  for insert with check (auth.uid() = user_id and public.taskmana_email_allowed());

drop policy if exists "update own" on public.taskmana_states;
create policy "update own" on public.taskmana_states
  for update
  using (auth.uid() = user_id and public.taskmana_email_allowed())
  with check (auth.uid() = user_id and public.taskmana_email_allowed());
