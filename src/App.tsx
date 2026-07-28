import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { AddEventSheet } from "./AddEventSheet";
import { EventIcon } from "./icons";
import { cityForEvent, currentCity, groupEvents, isInIntercityTransit } from "./timeline";
import { supabase } from "./supabase";
import type { City, ItineraryEvent, TimelineGroup } from "./types";
import { useTripData } from "./useTripData";
import { TravellersSheet } from "./TravellersSheet";
import { InstallHelp } from "./InstallHelp";
import { connectGoogleCalendar } from "./tripData";
import "./styles.css";

const sectionLabels: Record<TimelineGroup, string> = {
  earlier: "Earlier",
  now: "Now",
  next: "Next",
  later: "Later",
};

const formatTime = (value: string, timeZone: string) =>
  formatInTimeZone(value, timeZone, "EEE, d MMM, HH:mm");

function initialCalendarMessage() {
  const result = new URL(window.location.href).searchParams.get("calendar");
  if (result === "connected") return "Google account connected.";
  if (result === "denied") return "Google Calendar access was cancelled.";
  if (result) return "The Google Calendar connection could not be completed.";
  return undefined;
}

function eventHasCity(event: ItineraryEvent, cityId: string) {
  return event.type === "travel"
    ? event.originCityId === cityId || event.destinationCityId === cityId
    : event.cityId === cityId;
}

function eventDateKeys(event: ItineraryEvent, cities: City[]) {
  const startCity = event.type === "travel"
    ? cities.find((city) => city.id === event.originCityId)
    : cities.find((city) => city.id === event.cityId);
  const endCity = event.type === "travel"
    ? cities.find((city) => city.id === event.destinationCityId)
    : startCity;
  const startKey = formatInTimeZone(event.startsAt, startCity?.timeZone ?? "UTC", "yyyy-MM-dd");
  const endKey = formatInTimeZone(event.endsAt, endCity?.timeZone ?? "UTC", "yyyy-MM-dd");
  const keys: string[] = [];
  const cursor = new Date(`${startKey}T12:00:00Z`);
  const end = new Date(`${endKey}T12:00:00Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function EventCard({ event, cities, onEdit, highlighted }: { event: ItineraryEvent; cities: City[]; onEdit: () => void; highlighted: boolean }) {
  const city = cityForEvent(event, cities);
  const origin = event.type === "travel" ? cities.find((item) => item.id === event.originCityId) : undefined;
  const destination = event.type === "travel" ? cities.find((item) => item.id === event.destinationCityId) : undefined;
  const startZone = origin?.timeZone ?? city?.timeZone ?? "UTC";
  const endZone = destination?.timeZone ?? city?.timeZone ?? startZone;
  const end = event.endsAt ? ` — ${formatTime(event.endsAt, endZone)}` : "";
  const location = event.type === "travel"
    ? event.originCityId === event.destinationCityId ? origin?.name : "In transit"
    : city?.name;

  return (
    <article className={`event interactive-event${highlighted ? " navigation-target" : ""}`} id={`event-${event.id}`} role="button" tabIndex={0} onClick={onEdit} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") onEdit(); }}>
      <div className="location-rail">
        <span>{location}</span>
        <i aria-hidden="true" />
      </div>
      <div className="event-copy">
        <div className="event-heading">
          <EventIcon type={event.type} transport={event.type === "travel" ? event.transport : undefined} />
          <h3>{event.title}</h3>
        </div>
        {event.type === "travel" ? (
          <div className="journey-times">
            <div><span>{origin?.name}</span><time dateTime={event.startsAt}>{formatTime(event.startsAt, startZone)}</time></div>
            <i aria-hidden="true" />
            <div><span>{destination?.name}</span><time dateTime={event.endsAt}>{formatTime(event.endsAt, endZone)}</time></div>
          </div>
        ) : <time dateTime={event.startsAt}>{formatTime(event.startsAt, startZone)}{end}</time>}
        {event.details && <p>{event.details}</p>}
      </div>
    </article>
  );
}

function App() {
  const { data, error, loading, reload } = useTripData();
  const [now, setNow] = useState(() => new Date());
  const [signedInAs, setSignedInAs] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ItineraryEvent>();
  const [travellersOpen, setTravellersOpen] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [calendarMessage, setCalendarMessage] = useState<string | undefined>(initialCalendarMessage);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [open, setOpen] = useState<Record<TimelineGroup, boolean>>({
    earlier: false,
    now: true,
    next: true,
    later: false,
  });
  const [visible, setVisible] = useState<Record<"earlier" | "later", number>>({
    earlier: 1,
    later: 1,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void supabase?.auth.getUser().then(({ data }) => {
      setSignedInAs(data.user?.email);
    });
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("calendar");
    if (!result) return;
    url.searchParams.delete("calendar");
    window.history.replaceState({}, "", url);
    if (result === "connected") void reload();
  }, [reload]);

  const cities = useMemo(() => data?.cities ?? [], [data?.cities]);
  const itinerary = useMemo(() => data?.events ?? [], [data?.events]);
  const groups = useMemo(() => groupEvents(itinerary, now), [itinerary, now]);
  const place = currentCity(itinerary, cities, now, data?.startingCityId);
  const inTransit = isInIntercityTransit(itinerary, now);
  const dates = useMemo(() => [...new Set(itinerary.flatMap((event) => eventDateKeys(event, cities)))].sort(), [itinerary, cities]);
  const citiesWithEvents = useMemo(() => cities.filter((city) => itinerary.some((event) => eventHasCity(event, city.id))), [cities, itinerary]);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const goToEvents = (matches: ItineraryEvent[]) => {
    if (matches.length === 0) return;
    const ids = new Set(matches.map((event) => event.id));
    const containing = (Object.keys(groups) as TimelineGroup[]).filter((group) => groups[group].some((event) => ids.has(event.id)));
    setOpen({
      earlier: containing.includes("earlier"),
      now: containing.includes("now"),
      next: containing.includes("next"),
      later: containing.includes("later"),
    });

    const earlierDepth = groups.earlier.reduce((depth, event, index) => ids.has(event.id) ? Math.max(depth, index + 1) : depth, 0);
    const laterDepth = groups.later.reduce((depth, event, index) => ids.has(event.id) ? Math.max(depth, index + 1) : depth, 0);
    setVisible({
      earlier: earlierDepth || 1,
      later: laterDepth || 1,
    });

    const target = [...matches].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    setMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById(`event-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedIds(matches.map((event) => event.id));
      window.setTimeout(() => setHighlightedIds([]), 1800);
    }, 80);
  };

  if (loading) return <div className="auth-loading">Loading itinerary…</div>;

  if (error || !data) return (
    <main className="state-page">
      <p className="eyebrow">Trip unavailable</p>
      <h1>Trip</h1>
      <p>{error ?? "The trip could not be loaded."}</p>
      <button onClick={() => void reload()}>Try again</button>
    </main>
  );

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Shared itinerary</p>
          <h1>{data.tripName}</h1>
        </div>
        <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation">Go to</button>
      </header>

      <p className="status"><span />{inTransit ? "In transit · " : place ? `${place.name} · ` : ""}{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(now)}</p>

      {(Object.keys(sectionLabels) as TimelineGroup[]).map((group) => {
        const all = groups[group];
        const limited = group === "earlier" || group === "later";
        const shown = limited
          ? group === "earlier"
            ? all.slice(0, visible.earlier).reverse()
            : all.slice(0, visible.later)
          : all;
        return (
          <section className={`timeline-section ${group}`} id={`section-${group}`} key={group}>
            <button
              className="section-toggle"
              aria-expanded={open[group]}
              onClick={() => {
                if (open[group] && (group === "earlier" || group === "later")) {
                  setVisible((state) => ({ ...state, [group]: 1 }));
                }
                setOpen((state) => ({ ...state, [group]: !state[group] }));
              }}
            >
              <span aria-hidden="true">{open[group] ? "−" : "+"}</span>
              {sectionLabels[group]}
              <small>{all.length}</small>
            </button>
            {open[group] && (
              <div className="section-content">
                {group === "earlier" && visible.earlier < all.length && (
                  <button className="show-more" onClick={() => setVisible((state) => ({ ...state, earlier: state.earlier + 1 }))}>Show one earlier</button>
                )}
                {shown.map((event) => <EventCard event={event} cities={cities} onEdit={() => setEditingEvent(event)} highlighted={highlightedIds.includes(event.id)} key={event.id} />)}
                {group === "now" && all.length === 0 && (
                  <div className="empty-now">
                    <strong>{place?.name ?? "Before the trip"}</strong>
                    <span>No scheduled event</span>
                  </div>
                )}
                {group === "later" && visible.later < all.length && (
                  <button className="show-more" onClick={() => setVisible((state) => ({ ...state, [group]: state[group] + 1 }))}>Show one more</button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {itinerary.length === 0 && <p className="empty-trip">No events yet. Add the first moment of the trip.</p>}
      <button className="floating-add" onClick={() => setAddOpen(true)} aria-label="Add event"><span>+</span> Add</button>
      <footer>Live itinerary · {data.role}</footer>

      {menuOpen && (
        <div className="sheet-layer" role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Go to" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title"><h2>Go to</h2><button onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button></div>
            <button className="nav-now" onClick={() => {
              if (groups.now.length) goToEvents(groups.now);
              else {
                setOpen({ earlier: false, now: true, next: false, later: false });
                setVisible({ earlier: 1, later: 1 });
                scrollTo("section-now");
              }
            }}><span />Now</button>
            <h3>Date</h3>
            {dates.map((date) => {
              const matches = itinerary.filter((event) => eventDateKeys(event, cities).includes(date));
              return <button key={date} onClick={() => goToEvents(matches)}>{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`))}</button>;
            })}
            <h3>City</h3>
            {citiesWithEvents.map((city) => {
              const matches = itinerary.filter((event) => eventHasCity(event, city.id));
              return <button key={city.id} onClick={() => goToEvents(matches)}>{city.name}</button>;
            })}
            {data.role === "admin" && (
              <div className="calendar-connect">
                <h3>Calendar</h3>
                {data.calendarConnection ? (
                  <p><span>Google connected</span>{data.calendarConnection.googleAccountEmail}</p>
                ) : <p>Connect the account that can edit the shared trip calendar.</p>}
                {calendarMessage && <p className="calendar-message">{calendarMessage}</p>}
                <button disabled={connectingCalendar} onClick={() => {
                  setConnectingCalendar(true);
                  setCalendarMessage(undefined);
                  void connectGoogleCalendar(data.tripId).catch((caught: unknown) => {
                    setCalendarMessage(caught instanceof Error ? caught.message : "Could not connect Google Calendar.");
                    setConnectingCalendar(false);
                  });
                }}>{connectingCalendar ? "Opening Google…" : data.calendarConnection ? "Reconnect Google" : "Connect Google Calendar"}</button>
              </div>
            )}
            <InstallHelp />
            <div className="sheet-account">
              {signedInAs && <p><span>Signed in as</span>{signedInAs}</p>}
              <button onClick={() => { setMenuOpen(false); setTravellersOpen(true); }}>Travellers</button>
              <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
            </div>
          </div>
        </div>
      )}
      {addOpen && <AddEventSheet tripId={data.tripId} cities={cities} onClose={() => setAddOpen(false)} onChanged={reload} />}
      {editingEvent && <AddEventSheet tripId={data.tripId} cities={cities} event={editingEvent} tickets={data.tickets.filter((ticket) => ticket.eventId === editingEvent.id)} members={data.members} canDelete={data.role === "admin"} onClose={() => setEditingEvent(undefined)} onChanged={reload} />}
      {travellersOpen && <TravellersSheet data={data} onClose={() => setTravellersOpen(false)} onChanged={reload} />}
    </main>
  );
}

export default App;
