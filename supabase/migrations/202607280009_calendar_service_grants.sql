-- Secret-key requests run as service_role. RLS bypass does not itself grant
-- SQL table privileges, so grant only what the calendar backend requires.
grant select on public.trip_members to service_role;
grant select on public.profiles to service_role;
grant select, insert, update on public.calendar_connections to service_role;
grant select, insert, update on public.google_calendar_credentials to service_role;
grant select, insert, delete on public.calendar_oauth_states to service_role;
grant select, insert, update on public.calendar_imports to service_role;

