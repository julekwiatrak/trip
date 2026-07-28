import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

async function encryptionKey() {
  const bytes = base64ToBytes(requiredEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"));
  if (bytes.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must contain 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string) {
  const [ivValue, encryptedValue] = value.split(".");
  if (!ivValue || !encryptedValue) throw new Error("Stored Google credentials are invalid");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    await encryptionKey(),
    base64ToBytes(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
}

type CredentialRow = {
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Your session was not sent." }, { status: 401, headers: corsHeaders });

    const service = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("APP_SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await service.auth.getUser(accessToken);
    if (userError || !userData.user) return Response.json({ error: "Your session could not be verified." }, { status: 401, headers: corsHeaders });

    const { tripId, action, calendarId, eventId } = await request.json();
    const { data: membership, error: membershipError } = await service
      .from("trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return Response.json({ error: "You are not a member of this trip." }, { status: 403, headers: corsHeaders });
    if (action !== "push-event" && membership.role !== "admin") return Response.json({ error: "Only a trip admin can configure or run calendar sync." }, { status: 403, headers: corsHeaders });

    const { data: credentialData, error: credentialError } = await service
      .from("google_calendar_credentials")
      .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("trip_id", tripId)
      .single();
    if (credentialError) throw new Error("Connect a Google account before choosing a calendar.");
    const credentials = credentialData as CredentialRow;

    let googleAccessToken = await decrypt(credentials.access_token_encrypted);
    const expiresAt = credentials.token_expires_at ? new Date(credentials.token_expires_at).getTime() : 0;
    if (expiresAt < Date.now() + 60_000) {
      if (!credentials.refresh_token_encrypted) throw new Error("Google access has expired. Reconnect the account.");
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: requiredEnv("GOOGLE_CLIENT_ID"),
          client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
          refresh_token: await decrypt(credentials.refresh_token_encrypted),
          grant_type: "refresh_token",
        }),
      });
      if (!refreshResponse.ok) throw new Error("Google access could not be refreshed. Reconnect the account.");
      const refreshed = await refreshResponse.json();
      googleAccessToken = refreshed.access_token;
      const { error: updateError } = await service.from("google_calendar_credentials").update({
        access_token_encrypted: await encrypt(googleAccessToken),
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("trip_id", tripId);
      if (updateError) throw updateError;
    }

    if (action === "push-event") {
      if (!eventId) throw new Error("No event was supplied for Google Calendar.");
      const { data: itineraryEvent, error: eventError } = await service.from("events")
        .select("id, type, title, starts_at, ends_at, city_id, origin_city_id, destination_city_id, transport, details, external_calendar_id, external_event_id")
        .eq("id", eventId).eq("trip_id", tripId).single();
      if (eventError) throw eventError;
      const cityIds = [itineraryEvent.city_id, itineraryEvent.origin_city_id, itineraryEvent.destination_city_id].filter(Boolean);
      const { data: cityRows, error: cityError } = await service.from("cities").select("id, name, time_zone").in("id", cityIds);
      if (cityError) throw cityError;
      const cityById = new Map((cityRows ?? []).map((city) => [city.id, city]));
      const startCity = cityById.get(itineraryEvent.type === "travel" ? itineraryEvent.origin_city_id : itineraryEvent.city_id);
      const endCity = cityById.get(itineraryEvent.type === "travel" ? itineraryEvent.destination_city_id : itineraryEvent.city_id);
      if (!startCity || !endCity) throw new Error("The event cities could not be resolved.");

      const { data: connection, error: connectionError } = await service.from("calendar_connections")
        .select("calendar_id").eq("trip_id", tripId).single();
      if (connectionError || !connection?.calendar_id) throw new Error("The event was saved in Trip, but no Google trip calendar is selected.");
      if (itineraryEvent.external_event_id) {
        const { data: importRow } = await service.from("calendar_imports").select("google_event_type")
          .eq("trip_id", tripId).eq("google_event_id", itineraryEvent.external_event_id).maybeSingle();
        if (importRow?.google_event_type === "fromGmail") {
          return Response.json({ pushed: false, googleManaged: true }, { headers: corsHeaders });
        }
      }

      const googleBody = {
        summary: itineraryEvent.title,
        description: itineraryEvent.details ?? "",
        location: startCity.name,
        start: { dateTime: itineraryEvent.starts_at, timeZone: startCity.time_zone },
        end: { dateTime: itineraryEvent.ends_at, timeZone: endCity.time_zone },
        extendedProperties: { private: {
          tripAppEventId: itineraryEvent.id,
          tripId,
          tripEventType: itineraryEvent.type,
          ...(itineraryEvent.transport ? { tripTransport: itineraryEvent.transport } : {}),
          tripOriginCityId: itineraryEvent.origin_city_id ?? "",
          tripDestinationCityId: itineraryEvent.destination_city_id ?? "",
          tripCityId: itineraryEvent.city_id ?? "",
        } },
      };
      const targetCalendarId = itineraryEvent.external_calendar_id ?? connection.calendar_id;
      const googleUrl = itineraryEvent.external_event_id
        ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${encodeURIComponent(itineraryEvent.external_event_id)}`
        : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`;
      const googleResponse = await fetch(googleUrl, {
        method: itineraryEvent.external_event_id ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${googleAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(googleBody),
      });
      if (!googleResponse.ok) {
        const googleError = await googleResponse.json().catch(() => null);
        console.error("Google event push failed", googleResponse.status, googleError);
        throw new Error("The event was saved in Trip, but Google Calendar could not be updated.");
      }
      const googleEvent = await googleResponse.json();
      const { error: linkError } = await service.from("events").update({
        external_source: "google-calendar",
        external_calendar_id: targetCalendarId,
        external_event_id: googleEvent.id,
        external_updated_at: googleEvent.updated ?? null,
        external_etag: googleEvent.etag ?? null,
      }).eq("id", eventId);
      if (linkError) throw linkError;
      return Response.json({ pushed: true, googleEventId: googleEvent.id }, { headers: corsHeaders });
    }

    const listResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    if (!listResponse.ok) throw new Error("Google would not provide the calendar list. Reconnect the account and approve both permissions.");
    const list = await listResponse.json();
    const calendars = (list.items ?? [])
      .filter((calendar: { accessRole?: string; deleted?: boolean }) => !calendar.deleted && ["owner", "writer"].includes(calendar.accessRole ?? ""))
      .map((calendar: { id: string; summary: string; primary?: boolean; accessRole: string }) => ({
        id: calendar.id,
        name: calendar.summary,
        primary: Boolean(calendar.primary),
        accessRole: calendar.accessRole,
      }))
      .sort((left: { primary: boolean; name: string }, right: { primary: boolean; name: string }) => Number(right.primary) - Number(left.primary) || left.name.localeCompare(right.name));

    if (action === "list-calendars") return Response.json({ calendars }, { headers: corsHeaders });
    if (action === "select-calendar") {
      const selected = calendars.find((calendar: { id: string }) => calendar.id === calendarId);
      if (!selected) return Response.json({ error: "Choose a calendar that this Google account can edit." }, { status: 400, headers: corsHeaders });
      const { error: selectError } = await service.from("calendar_connections").update({
        calendar_id: selected.id,
        calendar_name: selected.name,
        next_sync_token: null,
      }).eq("trip_id", tripId);
      if (selectError) throw selectError;
      return Response.json({ calendar: selected }, { headers: corsHeaders });
    }
    if (action === "sync") {
      const { data: connection, error: connectionError } = await service
        .from("calendar_connections")
        .select("calendar_id, next_sync_token")
        .eq("trip_id", tripId)
        .single();
      if (connectionError || !connection?.calendar_id) throw new Error("Choose a trip calendar before syncing.");

      const googleEvents: Record<string, unknown>[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;
      do {
        const eventsUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events`);
        eventsUrl.searchParams.set("singleEvents", "true");
        eventsUrl.searchParams.set("showDeleted", "true");
        eventsUrl.searchParams.set("maxResults", "2500");
        if (connection.next_sync_token) eventsUrl.searchParams.set("syncToken", connection.next_sync_token);
        if (pageToken) eventsUrl.searchParams.set("pageToken", pageToken);
        const eventsResponse = await fetch(eventsUrl, { headers: { Authorization: `Bearer ${googleAccessToken}` } });
        if (eventsResponse.status === 410) {
          await service.from("calendar_connections").update({ next_sync_token: null }).eq("trip_id", tripId);
          throw new Error("Google reset the sync history. Press Sync again to perform a fresh sync.");
        }
        if (!eventsResponse.ok) throw new Error("Google would not provide the trip calendar events.");
        const page = await eventsResponse.json();
        googleEvents.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);

      const ids = googleEvents.map((event) => event.id).filter(Boolean) as string[];
      const { data: existingImports, error: importsError } = ids.length
        ? await service.from("calendar_imports").select("google_event_id, status").eq("trip_id", tripId).in("google_event_id", ids)
        : { data: [], error: null };
      if (importsError) throw importsError;
      const known = new Map((existingImports ?? []).map((item) => [item.google_event_id, item.status]));
      let discovered = 0;
      for (const raw of googleEvents) {
        const googleEvent = raw as {
          id: string; status?: string; eventType?: string; summary?: string; description?: string; location?: string;
          updated?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
        };
        if (!googleEvent.id || googleEvent.status === "cancelled") continue;
        const allDay = Boolean(googleEvent.start?.date);
        const row = {
          trip_id: tripId,
          google_event_id: googleEvent.id,
          google_event_type: googleEvent.eventType ?? "default",
          title: googleEvent.summary || "Untitled event",
          description: googleEvent.description ?? null,
          location: googleEvent.location ?? null,
          starts_at: allDay ? null : googleEvent.start?.dateTime,
          ends_at: allDay ? null : googleEvent.end?.dateTime,
          starts_on: allDay ? googleEvent.start?.date : null,
          ends_on: allDay ? googleEvent.end?.date : null,
          all_day: allDay,
          google_updated_at: googleEvent.updated ?? null,
          raw_event: raw,
        };
        if (!known.has(googleEvent.id)) {
          const { error: insertError } = await service.from("calendar_imports").insert({ ...row, status: "pending" });
          if (insertError) throw insertError;
          discovered += 1;
        } else {
          const { error: updateImportError } = await service.from("calendar_imports").update(row)
            .eq("trip_id", tripId).eq("google_event_id", googleEvent.id).neq("status", "imported");
          if (updateImportError) throw updateImportError;
        }
      }
      const { count: reviewCount, error: countError } = await service.from("calendar_imports")
        .select("id", { count: "exact", head: true }).eq("trip_id", tripId).in("status", ["pending", "ignored"]);
      if (countError) throw countError;
      const { error: finishError } = await service.from("calendar_connections").update({
        next_sync_token: nextSyncToken ?? connection.next_sync_token,
        last_synced_at: new Date().toISOString(),
      }).eq("trip_id", tripId);
      if (finishError) throw finishError;
      return Response.json({ discovered, reviewCount: reviewCount ?? 0 }, { headers: corsHeaders });
    }
    return Response.json({ error: "Unknown calendar action." }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Calendar request failed." }, { status: 500, headers: corsHeaders });
  }
});
