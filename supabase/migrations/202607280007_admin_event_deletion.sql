-- Only admins can delete an event. Regular members may still create and edit
-- events, but cannot orphan another traveller's private ticket files.
drop policy if exists "members delete events" on public.events;

create policy "admins delete events" on public.events for delete to authenticated
using (private.is_trip_admin(trip_id));
