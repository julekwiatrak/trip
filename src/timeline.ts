import type { City, ItineraryEvent, TimelineGroup } from "./types";

const startMs = (event: ItineraryEvent) => new Date(event.startsAt).getTime();
const endMs = (event: ItineraryEvent) =>
  event.endsAt ? new Date(event.endsAt).getTime() : startMs(event);

export function sortEvents(events: ItineraryEvent[]) {
  return [...events].sort((a, b) => startMs(a) - startMs(b));
}

export function groupEvents(
  events: ItineraryEvent[],
  now: Date,
): Record<TimelineGroup, ItineraryEvent[]> {
  const sorted = sortEvents(events);
  const timestamp = now.getTime();
  const earlier = sorted.filter((event) => endMs(event) < timestamp);
  const active = sorted.filter(
    (event) => startMs(event) <= timestamp && endMs(event) >= timestamp,
  );
  const future = sorted.filter((event) => startMs(event) > timestamp);
  const nextStart = future[0] ? startMs(future[0]) : undefined;
  const next = future.filter((event) => startMs(event) === nextStart);
  const nextIds = new Set(next.map((event) => event.id));

  return {
    earlier: earlier.reverse(),
    now: active,
    next,
    later: future.filter((event) => !nextIds.has(event.id)),
  };
}

export function cityForEvent(event: ItineraryEvent, cities: City[]) {
  if (event.type === "travel") return undefined;
  return cities.find((city) => city.id === event.cityId);
}

export function currentCity(events: ItineraryEvent[], cities: City[], now: Date) {
  const timestamp = now.getTime();
  const lastArrival = sortEvents(events)
    .filter(
      (event) => event.type === "arrival" && startMs(event) <= timestamp,
    )
    .at(-1);

  return lastArrival?.type === "arrival"
    ? cities.find((city) => city.id === lastArrival.cityId)
    : undefined;
}
