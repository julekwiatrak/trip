create type public.calendar_import_status as enum ('pending', 'imported', 'ignored');

-- Safe connection information visible to trip admins. OAuth tokens live in the
-- separate, client-inaccessible credentials table below.
create table public.calendar_connections (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  google_account_email text not null,
  calendar_id text,
  calendar_name text,
  connected_by uuid not null references public.profiles(id),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  next_sync_token text
);

create table public.google_calendar_credentials (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.calendar_oauth_states (
  state_hash text primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.calendar_imports (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  google_event_id text not null,
  google_event_type text not null default 'default',
  title text not null,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  starts_on date,
  ends_on date,
  all_day boolean not null default false,
  status public.calendar_import_status not null default 'pending',
  imported_event_id uuid references public.events(id) on delete set null,
  google_updated_at timestamptz,
  raw_event jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, google_event_id),
  constraint calendar_import_time_shape check (
    (all_day and starts_on is not null and ends_on is not null)
    or
    (not all_day and starts_at is not null and ends_at is not null)
  )
);

create trigger calendar_imports_set_updated_at before update on public.calendar_imports
for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;
alter table public.google_calendar_credentials enable row level security;
alter table public.calendar_oauth_states enable row level security;
alter table public.calendar_imports enable row level security;

create policy "admins view calendar connection" on public.calendar_connections
for select to authenticated using (private.is_trip_admin(trip_id));

create policy "admins view calendar imports" on public.calendar_imports
for select to authenticated using (private.is_trip_admin(trip_id));

create policy "admins update calendar imports" on public.calendar_imports
for update to authenticated
using (private.is_trip_admin(trip_id))
with check (private.is_trip_admin(trip_id));

grant select on public.calendar_connections to authenticated;
grant select, update on public.calendar_imports to authenticated;

-- OAuth state and credentials must only be accessed by trusted server code.
revoke all on public.google_calendar_credentials from anon, authenticated;
revoke all on public.calendar_oauth_states from anon, authenticated;

