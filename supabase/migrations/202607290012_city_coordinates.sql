alter table public.cities
  add column latitude double precision,
  add column longitude double precision,
  add constraint cities_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint cities_longitude_range check (longitude is null or longitude between -180 and 180),
  add constraint cities_coordinate_pair check ((latitude is null) = (longitude is null));

update public.cities set latitude = coordinates.latitude, longitude = coordinates.longitude
from (values
  ('London', 51.5074, -0.1278),
  ('Warsaw', 52.2297, 21.0122),
  ('Frankfurt an der Oder', 52.3471, 14.5506),
  ('Berlin', 52.5200, 13.4050),
  ('Paris', 48.8566, 2.3522),
  ('Bordeaux', 44.8378, -0.5792),
  ('Hendaye', 43.3580, -1.7740),
  ('San Sebastián', 43.3183, -1.9812),
  ('Madrid', 40.4168, -3.7038),
  ('Málaga', 36.7213, -4.4214)
) as coordinates(name, latitude, longitude)
where public.cities.name = coordinates.name;

