import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { City, EventType, ItineraryEvent, TransportMode } from "./types";

export type TripRole = "member" | "admin";

export type TripData = {
  tripId: string;
  tripName: string;
  startingCityId: string | null;
  role: TripRole;
  user: User;
  cities: City[];
  events: ItineraryEvent[];
};

type MembershipRow = { trip_id: string; role: TripRole };
type TripRow = { id: string; name: string; starting_city_id: string | null };
type CityRow = { id: string; name: string; country_code: string; time_zone: string };
type EventRow = {
  id: string;
  type: EventType;
  title: string;
  starts_at: string;
  ends_at: string | null;
  city_id: string | null;
  origin_city_id: string | null;
  destination_city_id: string | null;
  transport: TransportMode | null;
  details: string | null;
};

function mapEvent(row: EventRow): ItineraryEvent {
  const base = {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    ...(row.ends_at ? { endsAt: row.ends_at } : {}),
    ...(row.details ? { details: row.details } : {}),
  };

  if (row.type === "travel") {
    if (!row.ends_at || !row.origin_city_id || !row.destination_city_id || !row.transport) {
      throw new Error(`Travel event ${row.id} is incomplete.`);
    }
    return {
      ...base,
      type: "travel",
      endsAt: row.ends_at,
      originCityId: row.origin_city_id,
      destinationCityId: row.destination_city_id,
      transport: row.transport,
    };
  }

  if (!row.city_id) throw new Error(`Event ${row.id} has no city.`);
  return { ...base, type: row.type, cityId: row.city_id };
}

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function loadTripData(): Promise<TripData> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("You are not signed in.");

  const { data: membershipData, error: membershipError } = await client
    .from("trip_members")
    .select("trip_id, role")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  const membership = membershipData as MembershipRow | null;
  if (!membership) throw new Error("Your account is not a member of a trip yet.");

  const [tripResult, citiesResult, eventsResult] = await Promise.all([
    client.from("trips").select("id, name, starting_city_id").eq("id", membership.trip_id).single(),
    client.from("cities").select("id, name, country_code, time_zone").eq("trip_id", membership.trip_id).order("name"),
    client.from("events").select("id, type, title, starts_at, ends_at, city_id, origin_city_id, destination_city_id, transport, details").eq("trip_id", membership.trip_id).order("starts_at"),
  ]);

  if (tripResult.error) throw tripResult.error;
  if (citiesResult.error) throw citiesResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const trip = tripResult.data as TripRow;
  const cityRows = citiesResult.data as CityRow[];
  const eventRows = eventsResult.data as EventRow[];

  return {
    tripId: membership.trip_id,
    tripName: trip.name,
    startingCityId: trip.starting_city_id,
    role: membership.role,
    user: userData.user,
    cities: cityRows.map((city) => ({
      id: city.id,
      name: city.name,
      countryCode: city.country_code,
      timeZone: city.time_zone,
    })),
    events: eventRows.map(mapEvent),
  };
}

export async function createCity(
  tripId: string,
  city: Omit<City, "id">,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("cities").insert({
    trip_id: tripId,
    name: city.name,
    country_code: city.countryCode.toUpperCase(),
    time_zone: city.timeZone,
  });
  if (error) throw error;
}

export type NewLocatedEvent = {
  type: Exclude<EventType, "travel">;
  title: string;
  startsAt: string;
  endsAt?: string;
  cityId: string;
  details?: string;
};

export type NewTravelEvent = {
  type: "travel";
  title: string;
  startsAt: string;
  endsAt: string;
  originCityId: string;
  destinationCityId: string;
  transport: TransportMode;
  details?: string;
};

export type NewEvent = NewLocatedEvent | NewTravelEvent;

export async function createEvent(tripId: string, event: NewEvent): Promise<void> {
  const client = requireClient();
  const shape = event.type === "travel"
    ? {
        city_id: null,
        origin_city_id: event.originCityId,
        destination_city_id: event.destinationCityId,
        transport: event.transport,
      }
    : {
        city_id: event.cityId,
        origin_city_id: null,
        destination_city_id: null,
        transport: null,
      };
  const { error } = await client.from("events").insert({
    trip_id: tripId,
    type: event.type,
    title: event.title,
    starts_at: event.startsAt,
    ends_at: event.endsAt ?? null,
    details: event.details || null,
    ...shape,
  });
  if (error) throw error;
}

export async function updateEvent(eventId: string, event: NewEvent): Promise<void> {
  const client = requireClient();
  const shape = event.type === "travel"
    ? {
        city_id: null,
        origin_city_id: event.originCityId,
        destination_city_id: event.destinationCityId,
        transport: event.transport,
      }
    : {
        city_id: event.cityId,
        origin_city_id: null,
        destination_city_id: null,
        transport: null,
      };
  const { error } = await client.from("events").update({
    type: event.type,
    title: event.title,
    starts_at: event.startsAt,
    ends_at: event.endsAt ?? null,
    details: event.details || null,
    ...shape,
  }).eq("id", eventId);
  if (error) throw error;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("events").delete().eq("id", eventId);
  if (error) throw error;
}
