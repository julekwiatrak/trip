alter table public.events drop constraint event_shape;

create type public.event_type_v2 as enum (
  'travel',
  'hotel-stay',
  'food-drink',
  'other-activity'
);

alter table public.events
  alter column type type public.event_type_v2
  using (
    case type::text
      when 'travel' then 'travel'
      when 'stay' then 'hotel-stay'
      when 'food-drink' then 'food-drink'
      else 'other-activity'
    end
  )::public.event_type_v2;

drop type public.event_type;
alter type public.event_type_v2 rename to event_type;

create type public.transport_type_v2 as enum (
  'train',
  'flight',
  'bus',
  'taxi',
  'other'
);

alter table public.events
  alter column transport type public.transport_type_v2
  using (
    case
      when transport is null then null
      else case transport::text
        when 'train' then 'train'
        when 'flight' then 'flight'
        when 'bus' then 'bus'
        when 'car' then 'taxi'
        else 'other'
      end
    end
  )::public.transport_type_v2;

drop type public.transport_type;
alter type public.transport_type_v2 rename to transport_type;

alter table public.events add constraint event_shape check (
  (
    type = 'travel'
    and ends_at is not null
    and origin_city_id is not null
    and destination_city_id is not null
    and transport is not null
    and city_id is null
  )
  or
  (
    type <> 'travel'
    and city_id is not null
    and origin_city_id is null
    and destination_city_id is null
    and transport is null
  )
);

alter table public.trips
  add column starting_city_id uuid references public.cities(id) on delete restrict;

update public.trips
set starting_city_id = cities.id
from public.cities
where cities.trip_id = trips.id and cities.name = 'London';
