-- Run in the Supabase SQL Editor (role: postgres). Safe to run more than once.
create table if not exists public.donations (
  section_id  text primary key,                      -- matches ids in src/sections.js
  donor_type  text not null default 'person' check (donor_type in ('person','organization')),
  first_name  text,
  last_name   text,
  org_name    text,
  amount      numeric(10,2) not null check (amount >= 0),
  message     text check (char_length(message) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint donor_name_present check (
    (donor_type = 'person' and coalesce(trim(first_name),'') <> '' and coalesce(trim(last_name),'') <> '')
    or (donor_type = 'organization' and coalesce(trim(org_name),'') <> '')
  )
);

alter table public.donations enable row level security;

-- Anyone can see what has been revealed.
drop policy if exists "public read" on public.donations;
drop policy if exists "admin insert" on public.donations;
drop policy if exists "admin update" on public.donations;
drop policy if exists "admin delete" on public.donations;
create policy "public read" on public.donations
  for select to anon, authenticated using (true);

-- Only a signed-in admin (Supabase Auth user) can change anything.
create policy "admin insert" on public.donations
  for insert to authenticated with check (true);
create policy "admin update" on public.donations
  for update to authenticated using (true) with check (true);
create policy "admin delete" on public.donations
  for delete to authenticated using (true);

-- Live updates so open browsers peel new sections without refreshing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'donations'
  ) then
    alter publication supabase_realtime add table public.donations;
  end if;
end $$;
