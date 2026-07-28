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
  displayName: string;
  members: TripMember[];
  tickets: Ticket[];
  cities: City[];
  events: ItineraryEvent[];
  calendarConnection: CalendarConnection | null;
};

export type TripMember = { userId: string; displayName: string; role: TripRole };
export type Ticket = { id: string; eventId: string; fileName: string; storagePath: string; audience: "everyone" | "individual"; assignedTo: string | null };
export type CalendarConnection = {
  googleAccountEmail: string;
  calendarId: string | null;
  calendarName: string | null;
  lastSyncedAt: string | null;
};
export type EditableGoogleCalendar = { id: string; name: string; primary: boolean; accessRole: "owner" | "writer" };

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
  if (!row.ends_at) throw new Error(`Event ${row.id} has no end time.`);
  const base = {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...(row.details ? { details: row.details } : {}),
  };

  if (row.type === "travel") {
    if (!row.origin_city_id || !row.destination_city_id || !row.transport) {
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

  const [tripResult, profileResult, membersResult, citiesResult, eventsResult, ticketsResult, calendarResult] = await Promise.all([
    client.from("trips").select("id, name, starting_city_id").eq("id", membership.trip_id).single(),
    client.from("profiles").select("display_name").eq("id", userData.user.id).single(),
    client.from("trip_members").select("user_id, role, profiles(display_name)").eq("trip_id", membership.trip_id),
    client.from("cities").select("id, name, country_code, time_zone").eq("trip_id", membership.trip_id).order("name"),
    client.from("events").select("id, type, title, starts_at, ends_at, city_id, origin_city_id, destination_city_id, transport, details").eq("trip_id", membership.trip_id).order("starts_at"),
    client.from("tickets").select("id, event_id, file_name, storage_path, audience, assigned_to, events!inner(trip_id)").eq("events.trip_id", membership.trip_id),
    membership.role === "admin"
      ? client.from("calendar_connections").select("google_account_email, calendar_id, calendar_name, last_synced_at").eq("trip_id", membership.trip_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (tripResult.error) throw tripResult.error;
  if (profileResult.error) throw profileResult.error;
  if (membersResult.error) throw membersResult.error;
  if (citiesResult.error) throw citiesResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (ticketsResult.error) throw ticketsResult.error;
  if (calendarResult.error) throw calendarResult.error;

  const trip = tripResult.data as TripRow;
  const cityRows = citiesResult.data as CityRow[];
  const eventRows = eventsResult.data as EventRow[];

  return {
    tripId: membership.trip_id,
    tripName: trip.name,
    startingCityId: trip.starting_city_id,
    role: membership.role,
    user: userData.user,
    displayName: (profileResult.data as { display_name: string }).display_name,
    members: (membersResult.data as unknown as { user_id: string; role: TripRole; profiles: { display_name: string } }[]).map((row) => ({ userId: row.user_id, role: row.role, displayName: row.profiles.display_name })),
    tickets: (ticketsResult.data as { id: string; event_id: string; file_name: string; storage_path: string; audience: "everyone" | "individual"; assigned_to: string | null }[]).map((row) => ({ id: row.id, eventId: row.event_id, fileName: row.file_name, storagePath: row.storage_path, audience: row.audience, assignedTo: row.assigned_to })),
    cities: cityRows.map((city) => ({
      id: city.id,
      name: city.name,
      countryCode: city.country_code,
      timeZone: city.time_zone,
    })),
    events: eventRows.map(mapEvent),
    calendarConnection: calendarResult.data
      ? {
          googleAccountEmail: calendarResult.data.google_account_email,
          calendarId: calendarResult.data.calendar_id,
          calendarName: calendarResult.data.calendar_name,
          lastSyncedAt: calendarResult.data.last_synced_at,
        }
      : null,
  };
}

export async function connectGoogleCalendar(tripId: string) {
  const client = requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error("Your session has expired. Please sign in again.");
  const { data, error } = await client.functions.invoke("google-calendar-auth", {
    body: { tripId },
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  if (error) {
    const response = "context" in error && error.context instanceof Response ? error.context : null;
    if (response) {
      const body = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (!data?.authorizationUrl) throw new Error("Google did not return a connection address.");
  window.location.assign(data.authorizationUrl);
}

async function invokeCalendarSync<T>(tripId: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const client = requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error("Your session has expired. Please sign in again.");
  const { data, error } = await client.functions.invoke("google-calendar-sync", {
    body: { tripId, action, ...extra },
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  if (error) {
    const response = "context" in error && error.context instanceof Response ? error.context : null;
    if (response) {
      const body = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  return data as T;
}

export async function listGoogleCalendars(tripId: string) {
  const result = await invokeCalendarSync<{ calendars: EditableGoogleCalendar[] }>(tripId, "list-calendars");
  return result.calendars;
}

export async function selectGoogleCalendar(tripId: string, calendarId: string) {
  await invokeCalendarSync(tripId, "select-calendar", { calendarId });
}

export async function updateDisplayName(displayName: string) {
  const client = requireClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("You are not signed in.");
  const { error } = await client.from("profiles").update({ display_name: displayName.trim() }).eq("id", data.user.id);
  if (error) throw error;
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
  endsAt: string;
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

export async function deleteEvent(eventId: string, tickets: Ticket[]): Promise<void> {
  const client = requireClient();
  const paths = tickets.map((ticket) => ticket.storagePath);
  if (paths.length) {
    const { error: storageError } = await client.storage.from("tickets").remove(paths);
    if (storageError) throw storageError;
  }
  const { error } = await client.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

function safeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "ticket";
}

export async function uploadTicket(input: { tripId: string; eventId: string; file: File; assignedTo: string | null }) {
  const client = requireClient();
  const id = crypto.randomUUID();
  const storagePath = `${input.tripId}/${id}/${safeFileName(input.file.name)}`;
  const { error: rowError } = await client.from("tickets").insert({
    id,
    event_id: input.eventId,
    file_name: input.file.name,
    storage_path: storagePath,
    audience: input.assignedTo ? "individual" : "everyone",
    assigned_to: input.assignedTo,
  });
  if (rowError) throw rowError;
  const { error: uploadError } = await client.storage.from("tickets").upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;
}

export async function downloadTicket(ticket: Ticket) {
  const client = requireClient();
  const { data, error } = await client.storage.from("tickets").createSignedUrl(ticket.storagePath, 60, { download: ticket.fileName });
  if (error) throw error;
  window.location.assign(data.signedUrl);
}

export async function deleteTicket(ticket: Ticket) {
  const client = requireClient();
  const { error: storageError } = await client.storage.from("tickets").remove([ticket.storagePath]);
  if (storageError) throw storageError;
  const { error } = await client.from("tickets").delete().eq("id", ticket.id);
  if (error) throw error;
}
