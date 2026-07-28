import { useEffect, useMemo, useState } from "react";
import { cities, itinerary } from "./data";
import { EventIcon } from "./icons";
import { cityForEvent, currentCity, groupEvents } from "./timeline";
import { supabase } from "./supabase";
import type { ItineraryEvent, TimelineGroup } from "./types";
import "./styles.css";

const sectionLabels: Record<TimelineGroup, string> = {
  earlier: "Earlier",
  now: "Now",
  next: "Next",
  later: "Later",
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function EventCard({ event }: { event: ItineraryEvent }) {
  const city = cityForEvent(event, cities);
  const end = event.endsAt ? ` — ${formatTime(event.endsAt)}` : "";
  const location = event.type === "travel" ? "In transit" : city?.name;

  return (
    <article className="event" id={`event-${event.id}`}>
      <div className="location-rail">
        <span>{location}</span>
        <i aria-hidden="true" />
      </div>
      <div className="event-copy">
        <div className="event-heading">
          <EventIcon type={event.type} />
          <h3>{event.title}</h3>
        </div>
        <time dateTime={event.startsAt}>{formatTime(event.startsAt)}{end}</time>
        {event.details && <p>{event.details}</p>}
      </div>
    </article>
  );
}

function App() {
  const [now, setNow] = useState(() => new Date());
  const [signedInAs, setSignedInAs] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<Record<TimelineGroup, boolean>>({
    earlier: false,
    now: true,
    next: true,
    later: true,
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

  const groups = useMemo(() => groupEvents(itinerary, now), [now]);
  const place = currentCity(itinerary, cities, now);
  const dates = useMemo(
    () => [...new Set(itinerary.map((event) => event.startsAt.slice(0, 10)))],
    [],
  );

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Shared itinerary</p>
          <h1>Trip</h1>
        </div>
        <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation">Go to</button>
      </header>

      <p className="status"><span />{place ? `${place.name} · ` : ""}{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(now)}</p>

      {(Object.keys(sectionLabels) as TimelineGroup[]).map((group) => {
        const all = groups[group];
        const limited = group === "earlier" || group === "later";
        const shown = limited ? all.slice(0, visible[group]) : all;
        return (
          <section className={`timeline-section ${group}`} id={`section-${group}`} key={group}>
            <button
              className="section-toggle"
              aria-expanded={open[group]}
              onClick={() => setOpen((state) => ({ ...state, [group]: !state[group] }))}
            >
              <span aria-hidden="true">{open[group] ? "−" : "+"}</span>
              {sectionLabels[group]}
              <small>{all.length}</small>
            </button>
            {open[group] && (
              <div className="section-content">
                {shown.map((event) => <EventCard event={event} key={event.id} />)}
                {group === "now" && all.length === 0 && (
                  <div className="empty-now">
                    <strong>{place?.name ?? "Before the trip"}</strong>
                    <span>No scheduled event</span>
                  </div>
                )}
                {limited && visible[group] < all.length && (
                  <button className="show-more" onClick={() => setVisible((state) => ({ ...state, [group]: state[group] + 1 }))}>Show one more</button>
                )}
              </div>
            )}
          </section>
        );
      })}

      <footer>Live itinerary · demo data</footer>

      {menuOpen && (
        <div className="sheet-layer" role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Go to" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title"><h2>Go to</h2><button onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button></div>
            <button className="nav-now" onClick={() => scrollTo("section-now")}><span />Now</button>
            <h3>Date</h3>
            {dates.map((date) => {
              const first = itinerary.find((event) => event.startsAt.startsWith(date));
              return <button key={date} onClick={() => first && scrollTo(`event-${first.id}`)}>{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`))}</button>;
            })}
            <h3>City</h3>
            {cities.map((city) => {
              const first = itinerary.find((event) => event.type !== "travel" && event.cityId === city.id);
              return <button key={city.id} onClick={() => first && scrollTo(`event-${first.id}`)}>{city.name}</button>;
            })}
            <div className="sheet-account">
              {signedInAs && <p><span>Signed in as</span>{signedInAs}</p>}
              <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
