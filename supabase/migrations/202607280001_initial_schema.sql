create extension if not exists pgcrypto;

create type public.trip_role as enum ('member', 'admin');
create type public.event_type as enum ('travel', 'arrival', 'stay', 'food-drink', 'activity', 'note');
create type public.transport_type as enum ('train', 'flight', 'bus', 'car', 'walk');
create type public.ticket_audience as enum ('everyone', 'individual');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.trip_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  country_code text not null check (char_length(country_code) = 2),
  time_zone text not null,
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  type public.event_type not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  city_id uuid references public.cities(id) on delete restrict,
  origin_city_id uuid references public.cities(id) on delete restrict,
  destination_city_id uuid references public.cities(id) on delete restrict,
  transport public.transport_type,
  details text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_time_order check (ends_at is null or ends_at >= starts_at),
  constraint event_shape check (
    (type = 'travel' and ends_at is not null and origin_city_id is not null and destination_city_id is not null and transport is not null)
    or
    (type <> 'travel' and city_id is not null and origin_city_id is null and destination_city_id is null and transport is null)
  )
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  body text not null check (char_length(body) > 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  audience public.ticket_audience not null,
  assigned_to uuid references public.profiles(id) on delete restrict,
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint ticket_assignment check (
    (audience = 'everyone' and assigned_to is null)
    or (audience = 'individual' and assigned_to is not null)
  )
);

create schema if not exists private;

create or replace function private.is_trip_member(target_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_trip_admin(target_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id
      and user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function private.is_user_trip_member(target_trip_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id and user_id = target_user_id
  );
$$;

create or replace function private.ticket_trip_id(target_ticket_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select e.trip_id from public.tickets t
  join public.events e on e.id = t.event_id
  where t.id = target_ticket_id;
$$;

create or replace function private.can_view_ticket(target_ticket_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tickets t
    join public.events e on e.id = t.event_id
    where t.id = target_ticket_id
      and private.is_trip_member(e.trip_id)
      and (
        t.audience = 'everyone'
        or t.assigned_to = (select auth.uid())
        or private.is_trip_admin(e.trip_id)
      )
  );
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger notes_set_updated_at before update on public.notes
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.cities enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;
alter table public.tickets enable row level security;

create policy "members view profiles" on public.profiles for select to authenticated
using (id = (select auth.uid()) or exists (
  select 1 from public.trip_members mine
  join public.trip_members theirs on theirs.trip_id = mine.trip_id
  where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
));
create policy "users update own profile" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members view trips" on public.trips for select to authenticated
using (private.is_trip_member(id));
create policy "admins update trips" on public.trips for update to authenticated
using (private.is_trip_admin(id)) with check (private.is_trip_admin(id));

create policy "members view membership" on public.trip_members for select to authenticated
using (private.is_trip_member(trip_id));
create policy "admins add membership" on public.trip_members for insert to authenticated
with check (private.is_trip_admin(trip_id));
create policy "admins update membership" on public.trip_members for update to authenticated
using (private.is_trip_admin(trip_id)) with check (private.is_trip_admin(trip_id));
create policy "admins remove membership" on public.trip_members for delete to authenticated
using (private.is_trip_admin(trip_id));

create policy "members view cities" on public.cities for select to authenticated using (private.is_trip_member(trip_id));
create policy "members add cities" on public.cities for insert to authenticated with check (private.is_trip_member(trip_id));
create policy "members update cities" on public.cities for update to authenticated using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id));
create policy "members delete cities" on public.cities for delete to authenticated using (private.is_trip_member(trip_id));

create policy "members view events" on public.events for select to authenticated using (private.is_trip_member(trip_id));
create policy "members add events" on public.events for insert to authenticated with check (private.is_trip_member(trip_id) and created_by = (select auth.uid()));
create policy "members update events" on public.events for update to authenticated using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id));
create policy "members delete events" on public.events for delete to authenticated using (private.is_trip_member(trip_id));

create policy "members view notes" on public.notes for select to authenticated
using (private.is_trip_member((select trip_id from public.events where id = event_id)));
create policy "members add notes" on public.notes for insert to authenticated
with check (created_by = (select auth.uid()) and private.is_trip_member((select trip_id from public.events where id = event_id)));
create policy "members update notes" on public.notes for update to authenticated
using (private.is_trip_member((select trip_id from public.events where id = event_id)))
with check (private.is_trip_member((select trip_id from public.events where id = event_id)));
create policy "members delete notes" on public.notes for delete to authenticated
using (private.is_trip_member((select trip_id from public.events where id = event_id)));

create policy "permitted users view tickets" on public.tickets for select to authenticated
using (private.can_view_ticket(id));
create policy "members add tickets" on public.tickets for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and private.is_trip_member((select trip_id from public.events where id = event_id))
  and (
    assigned_to is null
    or private.is_user_trip_member(
      (select trip_id from public.events where id = event_id),
      assigned_to
    )
  )
);
create policy "permitted users update tickets" on public.tickets for update to authenticated
using (private.can_view_ticket(id))
with check (private.can_view_ticket(id));
create policy "permitted users delete tickets" on public.tickets for delete to authenticated
using (private.can_view_ticket(id));

revoke all on all tables in schema public from anon;
grant select, update on public.profiles to authenticated;
grant select, update on public.trips to authenticated;
grant select, insert, update, delete on public.trip_members to authenticated;
grant select, insert, update, delete on public.cities to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.tickets to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;
grant execute on function private.is_trip_admin(uuid) to authenticated;
grant execute on function private.is_user_trip_member(uuid, uuid) to authenticated;
grant execute on function private.ticket_trip_id(uuid) to authenticated;
grant execute on function private.can_view_ticket(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.apple.pkpass'])
on conflict (id) do nothing;

create policy "members upload ticket files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tickets'
  and private.is_trip_member(((storage.foldername(name))[1])::uuid)
);
create policy "permitted users download ticket files" on storage.objects for select to authenticated
using (
  bucket_id = 'tickets'
  and exists (
    select 1 from public.tickets
    where storage_path = name and private.can_view_ticket(id)
  )
);
create policy "permitted users update ticket files" on storage.objects for update to authenticated
using (
  bucket_id = 'tickets'
  and exists (select 1 from public.tickets where storage_path = name and private.can_view_ticket(id))
);
create policy "permitted users delete ticket files" on storage.objects for delete to authenticated
using (
  bucket_id = 'tickets'
  and exists (select 1 from public.tickets where storage_path = name and private.can_view_ticket(id))
);
