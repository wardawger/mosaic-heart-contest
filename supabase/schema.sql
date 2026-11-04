-- Mosaic Heart database: many team hearts, each with its own donations.
-- Run in the Supabase SQL Editor (role: postgres). Safe to run more than once,
-- and it upgrades the earlier single-heart setup: existing donations move into
-- a first heart ("Jax Healing Hearts", link /h/jax-healing-hearts) owned by the
-- oldest user account, i.e. your original admin login.
--
-- After running it, set the access code teams need to create a heart:
--   update private.settings set value = 'your-code-here' where key = 'access_code';

-- ---------- hearts: one per team ----------
create table if not exists public.hearts (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  name        text not null check (char_length(trim(name)) between 2 and 80),
  donate_url  text check (donate_url is null or donate_url ~* '^https://'),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------- donations: one per revealed section of a heart ----------
create table if not exists public.donations (
  heart_id    uuid not null references public.hearts(id) on delete cascade,
  section_id  text not null,                      -- matches ids in src/sections.js
  donor_type  text not null default 'person' check (donor_type in ('person','organization')),
  first_name  text,
  last_name   text,
  org_name    text,
  amount      numeric(10,2) not null check (amount >= 0),
  message     text check (char_length(message) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (heart_id, section_id),
  constraint donor_name_present check (
    (donor_type = 'person' and coalesce(trim(first_name),'') <> '' and coalesce(trim(last_name),'') <> '')
    or (donor_type = 'organization' and coalesce(trim(org_name),'') <> '')
  )
);

-- Upgrade from the single-heart table: add heart_id, move old donations into
-- the first heart, and key donations by (heart, section).
alter table public.donations add column if not exists heart_id uuid references public.hearts(id) on delete cascade;
do $$
declare
  first_owner uuid;
  first_heart uuid;
begin
  if exists (select 1 from public.donations where heart_id is null) then
    select id into first_owner from auth.users order by created_at limit 1;
    if first_owner is null then
      raise exception 'Create your admin user first (Authentication > Users), then run this again.';
    end if;
    insert into public.hearts (slug, name, owner_id)
      values ('jax-healing-hearts', 'Jax Healing Hearts', first_owner)
      on conflict (slug) do nothing;
    select id into first_heart from public.hearts where slug = 'jax-healing-hearts';
    update public.donations set heart_id = first_heart where heart_id is null;
  end if;
end $$;
alter table public.donations alter column heart_id set not null;
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'donations_pkey' and conrelid = 'public.donations'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table public.donations drop constraint donations_pkey;
    alter table public.donations add primary key (heart_id, section_id);
  end if;
end $$;

-- ---------- access code (private: no site visitor or team can read it) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
-- no policies on purpose: only the database owner (and create_heart, which runs as it) can read it
alter table private.settings enable row level security;
insert into private.settings (key, value) values ('access_code', 'change-me') on conflict (key) do nothing;

-- Teams create hearts only through this function, which checks the code.
create or replace function public.create_heart(p_name text, p_slug text, p_donate_url text, p_code text)
returns public.hearts
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
  result public.hearts;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select value into expected from private.settings where key = 'access_code';
  if expected is null or expected = 'change-me' then
    raise exception 'Creating hearts is not open yet: the site owner still needs to set an access code.';
  end if;
  if p_code is distinct from expected then
    raise exception 'That access code is not right.';
  end if;
  insert into public.hearts (slug, name, donate_url, owner_id)
    values (lower(trim(p_slug)), trim(p_name), nullif(trim(p_donate_url), ''), auth.uid())
    returning * into result;
  return result;
exception
  when unique_violation then
    raise exception 'That link name is already taken. Try another.';
end $$;
revoke all on function public.create_heart(text, text, text, text) from public, anon;
grant execute on function public.create_heart(text, text, text, text) to authenticated;

-- ---------- who can do what ----------
alter table public.hearts enable row level security;
alter table public.donations enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.hearts, public.donations to anon, authenticated;
-- teams can rename their heart and change its donation link, never its link name or owner
grant update (name, donate_url) on public.hearts to authenticated;
grant delete on public.hearts to authenticated;
grant insert, update, delete on public.donations to authenticated;

drop policy if exists "public read" on public.hearts;
drop policy if exists "owner update" on public.hearts;
drop policy if exists "owner delete" on public.hearts;
create policy "public read" on public.hearts for select to anon, authenticated using (true);
create policy "owner update" on public.hearts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete" on public.hearts for delete to authenticated
  using (owner_id = auth.uid());

-- old single-heart policies
drop policy if exists "admin insert" on public.donations;
drop policy if exists "admin update" on public.donations;
drop policy if exists "admin delete" on public.donations;

drop policy if exists "public read" on public.donations;
drop policy if exists "owner insert" on public.donations;
drop policy if exists "owner update" on public.donations;
drop policy if exists "owner delete" on public.donations;
create policy "public read" on public.donations for select to anon, authenticated using (true);
create policy "owner insert" on public.donations for insert to authenticated
  with check (exists (select 1 from public.hearts h where h.id = heart_id and h.owner_id = auth.uid()));
create policy "owner update" on public.donations for update to authenticated
  using (exists (select 1 from public.hearts h where h.id = heart_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.hearts h where h.id = heart_id and h.owner_id = auth.uid()));
create policy "owner delete" on public.donations for delete to authenticated
  using (exists (select 1 from public.hearts h where h.id = heart_id and h.owner_id = auth.uid()));

-- ---------- live updates (hearts peel and the leaderboard moves without refreshing) ----------
do $$
declare
  t text;
begin
  foreach t in array array['donations', 'hearts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
