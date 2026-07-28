alter table public.events
  add column external_source text,
  add column external_calendar_id text,
  add column external_event_id text,
  add column external_updated_at timestamptz,
  add column external_etag text,
  add constraint external_source_supported
    check (external_source is null or external_source = 'google-calendar'),
  add constraint external_event_identity
    check (
      (external_source is null and external_calendar_id is null and external_event_id is null)
      or
      (external_source is not null and external_calendar_id is not null and external_event_id is not null)
    );

create unique index events_external_calendar_event
  on public.events (external_calendar_id, external_event_id)
  where external_event_id is not null;
