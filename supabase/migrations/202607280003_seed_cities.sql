-- Seed the planned route for every existing trip. Country and timezone remain
-- metadata; the interface normally shows only the city name.
insert into public.cities (trip_id, name, country_code, time_zone)
select trips.id, route.name, route.country_code, route.time_zone
from public.trips
cross join (
  values
    ('London', 'GB', 'Europe/London'),
    ('Warsaw', 'PL', 'Europe/Warsaw'),
    ('Frankfurt an der Oder', 'DE', 'Europe/Berlin'),
    ('Berlin', 'DE', 'Europe/Berlin'),
    ('Paris', 'FR', 'Europe/Paris'),
    ('Bordeaux', 'FR', 'Europe/Paris'),
    ('Hendaye', 'FR', 'Europe/Paris'),
    ('San Sebastián', 'ES', 'Europe/Madrid'),
    ('Madrid', 'ES', 'Europe/Madrid'),
    ('Málaga', 'ES', 'Europe/Madrid')
) as route(name, country_code, time_zone)
on conflict (trip_id, name) do update set
  country_code = excluded.country_code,
  time_zone = excluded.time_zone;
