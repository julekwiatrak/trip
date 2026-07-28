-- Point events cannot meaningfully occupy the live NOW section. Give any
-- existing point events a conservative one-hour duration, then require an end.
update public.events
set ends_at = starts_at + interval '1 hour'
where ends_at is null;

alter table public.events
  alter column ends_at set not null;
