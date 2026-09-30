-- 1 Bell: one row per user holding their plan + workout log as JSON.
-- Run once in the Supabase dashboard → SQL Editor.

create table if not exists public.plans (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint plans_data_size check (pg_column_size(data) < 200000)
);

alter table public.plans enable row level security;

-- Signed-in users can only see and change their own row.
create policy "own plan: select" on public.plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own plan: insert" on public.plans
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own plan: update" on public.plans
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own plan: delete" on public.plans
  for delete to authenticated using ((select auth.uid()) = user_id);
