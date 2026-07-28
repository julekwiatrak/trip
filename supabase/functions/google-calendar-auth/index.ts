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

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function encrypt(value: string) {
  const keyBytes = Uint8Array.from(atob(requiredEnv("GOOGLE_TOKEN_ENCRYPTION_KEY")), (character) => character.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must contain 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

const appRedirect = (result: string) => {
  const url = new URL(requiredEnv("APP_URL"));
  url.searchParams.set("calendar", result);
  return Response.redirect(url.toString(), 302);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const service = createClient(supabaseUrl, requiredEnv("APP_SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const url = new URL(request.url);

    if (url.pathname.endsWith("/callback")) {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (url.searchParams.has("error") || !state || !code) return appRedirect("denied");

      const stateHash = await sha256(state);
      const { data: oauthState, error: stateError } = await service
        .from("calendar_oauth_states")
        .delete()
        .eq("state_hash", stateHash)
        .gt("expires_at", new Date().toISOString())
        .select("trip_id, user_id")
        .maybeSingle();
      if (stateError || !oauthState) return appRedirect("invalid-state");

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: requiredEnv("GOOGLE_CLIENT_ID"),
          client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
          redirect_uri: `${supabaseUrl}/functions/v1/google-calendar-auth/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
      const tokens = await tokenResponse.json();

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profileResponse.ok) throw new Error("Could not read the connected Google account");
      const profile = await profileResponse.json();

      const { data: oldCredentials } = await service
        .from("google_calendar_credentials")
        .select("refresh_token_encrypted")
        .eq("trip_id", oauthState.trip_id)
        .maybeSingle();
      const { error: credentialsError } = await service.from("google_calendar_credentials").upsert({
        trip_id: oauthState.trip_id,
        access_token_encrypted: await encrypt(tokens.access_token),
        refresh_token_encrypted: tokens.refresh_token
          ? await encrypt(tokens.refresh_token)
          : oldCredentials?.refresh_token_encrypted,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      });
      if (credentialsError) throw credentialsError;

      const { error: connectionError } = await service.from("calendar_connections").upsert({
        trip_id: oauthState.trip_id,
        google_account_email: profile.email,
        connected_by: oauthState.user_id,
        connected_at: new Date().toISOString(),
      });
      if (connectionError) throw connectionError;
      return appRedirect("connected");
    }

    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    const authorization = request.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Your Supabase session was not sent. Please sign out and sign in again." }, { status: 401, headers: corsHeaders });

    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await service.auth.getUser(accessToken);
    if (userError || !userData.user) {
      console.warn("Supabase session validation failed", userError?.message);
      return Response.json({ error: "Your Supabase session could not be verified. Please sign out and sign in again." }, { status: 401, headers: corsHeaders });
    }

    const { tripId } = await request.json();
    const { data: membership, error: membershipError } = await service
      .from("trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (membershipError) {
      console.error("Admin membership lookup failed", membershipError);
      return Response.json({ error: `Could not check your trip admin role: ${membershipError.message}` }, { status: 500, headers: corsHeaders });
    }
    console.log("Calendar connection admin check", {
      userId: userData.user.id,
      tripId,
      isAdmin: Boolean(membership),
    });
    if (!membership) return Response.json({ error: "Only a trip admin can connect a calendar." }, { status: 403, headers: corsHeaders });

    const state = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const { error: insertError } = await service.from("calendar_oauth_states").insert({
      state_hash: await sha256(state),
      trip_id: tripId,
      user_id: userData.user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (insertError) throw insertError;

    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      redirect_uri: `${supabaseUrl}/functions/v1/google-calendar-auth/callback`,
      response_type: "code",
      scope: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();

    return Response.json({ authorizationUrl }, { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Calendar connection failed" }, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
