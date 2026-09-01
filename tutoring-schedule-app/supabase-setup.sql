-- Run this once in your Supabase project's SQL Editor
-- (Supabase dashboard -> SQL Editor -> New query -> paste -> Run)

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Row Level Security is on by default with no policies (meaning: no access).
-- This app has no login system, so the anon key needs open read/write
-- access to just this one table. Anyone who has your Supabase URL + anon
-- key could read or edit this table -- fine for a personal tracker you're
-- not sharing, but keep those values out of any public repo if that
-- matters to you.

alter table kv_store enable row level security;

create policy "Allow anon read" on kv_store
  for select
  to anon
  using (true);

create policy "Allow anon write" on kv_store
  for insert
  to anon
  with check (true);

create policy "Allow anon update" on kv_store
  for update
  to anon
  using (true);
