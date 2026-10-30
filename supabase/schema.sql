-- Travel Memory cloud persistence schema.
-- Run this in Supabase SQL Editor after enabling Authentication > Providers > Anonymous.
-- The browser only uses the publishable/anon key; never put a service_role key in Vite.

create table if not exists public.locations (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  city_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  location_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  trip_id text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  owner_id uuid not null default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists trips_location_id_idx on public.trips (location_id);
create index if not exists photos_trip_id_idx on public.photos (trip_id);
create index if not exists locations_owner_id_idx on public.locations (owner_id);
create index if not exists trips_owner_id_idx on public.trips (owner_id);
create index if not exists photos_owner_id_idx on public.photos (owner_id);

alter table public.locations enable row level security;
alter table public.trips enable row level security;
alter table public.photos enable row level security;
alter table public.settings enable row level security;

drop policy if exists "travel locations owner read" on public.locations;
drop policy if exists "travel locations owner write" on public.locations;
create policy "travel locations owner read" on public.locations
  for select to authenticated using (auth.uid() = owner_id);
create policy "travel locations owner write" on public.locations
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "travel trips owner read" on public.trips;
drop policy if exists "travel trips owner write" on public.trips;
create policy "travel trips owner read" on public.trips
  for select to authenticated using (auth.uid() = owner_id);
create policy "travel trips owner write" on public.trips
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "travel photos owner read" on public.photos;
drop policy if exists "travel photos owner write" on public.photos;
create policy "travel photos owner read" on public.photos
  for select to authenticated using (auth.uid() = owner_id);
create policy "travel photos owner write" on public.photos
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "travel settings owner read" on public.settings;
drop policy if exists "travel settings owner write" on public.settings;
create policy "travel settings owner read" on public.settings
  for select to authenticated using (auth.uid() = owner_id);
create policy "travel settings owner write" on public.settings
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('travel-photos', 'travel-photos', false)
on conflict (id) do nothing;

drop policy if exists "travel photo files owner read" on storage.objects;
drop policy if exists "travel photo files owner insert" on storage.objects;
drop policy if exists "travel photo files owner update" on storage.objects;
drop policy if exists "travel photo files owner delete" on storage.objects;
create policy "travel photo files owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'travel-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "travel photo files owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'travel-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "travel photo files owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'travel-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'travel-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "travel photo files owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'travel-photos' and (storage.foldername(name))[1] = auth.uid()::text);
