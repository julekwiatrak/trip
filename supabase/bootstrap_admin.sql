-- Run after the migration and after creating your own Auth user.
-- Replace the email before running this in the Supabase SQL Editor.
do $$
declare
  admin_email text := 'REPLACE_WITH_YOUR_EMAIL';
  admin_user_id uuid;
  target_trip_id uuid;
begin
  select id into admin_user_id from auth.users where email = admin_email;
  if admin_user_id is null then
    raise exception 'No Auth user exists for %', admin_email;
  end if;

  insert into public.profiles (id, display_name)
  values (admin_user_id, split_part(admin_email, '@', 1))
  on conflict (id) do nothing;

  select id into target_trip_id from public.trips where name = 'Trip' order by created_at limit 1;
  if target_trip_id is null then
    insert into public.trips (name) values ('Trip') returning id into target_trip_id;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (target_trip_id, admin_user_id, 'admin')
  on conflict (trip_id, user_id) do update set role = 'admin';
end $$;
