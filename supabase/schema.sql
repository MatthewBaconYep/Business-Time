-- Business Time: run once in the Supabase SQL editor of the Plantalog project.
-- One row per user holding all projects, time records, categories and the
-- running stopwatch as JSON. "version" lets the app notice when another
-- device saved in between.

create table if not exists public.bt_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.bt_data enable row level security;

drop policy if exists "bt own row: select" on public.bt_data;
drop policy if exists "bt own row: insert" on public.bt_data;
drop policy if exists "bt own row: update" on public.bt_data;
drop policy if exists "bt own row: delete" on public.bt_data;

create policy "bt own row: select" on public.bt_data
  for select using (auth.uid() = user_id);
create policy "bt own row: insert" on public.bt_data
  for insert with check (auth.uid() = user_id);
create policy "bt own row: update" on public.bt_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bt own row: delete" on public.bt_data
  for delete using (auth.uid() = user_id);
