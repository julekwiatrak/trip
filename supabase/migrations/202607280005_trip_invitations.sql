create extension if not exists citext;

create table public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email citext not null,
  display_name text not null,
  role public.trip_role not null default 'member',
  invited_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (trip_id, email)
);

alter table public.trip_invitations enable row level security;

create policy "admins view invitations" on public.trip_invitations for select to authenticated
using (private.is_trip_admin(trip_id));
create policy "admins create invitations" on public.trip_invitations for insert to authenticated
with check (private.is_trip_admin(trip_id) and invited_by = (select auth.uid()));
create policy "admins update invitations" on public.trip_invitations for update to authenticated
using (private.is_trip_admin(trip_id)) with check (private.is_trip_admin(trip_id));
create policy "admins delete invitations" on public.trip_invitations for delete to authenticated
using (private.is_trip_admin(trip_id));

grant select, insert, update, delete on public.trip_invitations to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.trip_members (trip_id, user_id, role)
  select invitation.trip_id, new.id, invitation.role
  from public.trip_invitations invitation
  where invitation.email = new.email and invitation.accepted_at is null
  on conflict (trip_id, user_id) do nothing;

  update public.trip_invitations
  set accepted_at = now()
  where email = new.email and accepted_at is null;

  return new;
end;
$$;
