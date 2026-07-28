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

    const { tripId, action, calendarId } = await request.json();
    const { data: membership, error: membershipError } = await service
      .from("trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return Response.json({ error: "Only a trip admin can configure calendar sync." }, { status: 403, headers: corsHeaders });

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
    return Response.json({ error: "Unknown calendar action." }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Calendar request failed." }, { status: 500, headers: corsHeaders });
  }
});

