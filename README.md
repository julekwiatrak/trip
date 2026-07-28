# Trip

A mobile-first live itinerary built with React, TypeScript, Vite, and Supabase.

## Local development

```sh
npm install
cp .env.example .env.local
npm run dev
```

The app is served at `http://localhost:5173/trip/`.

## Connect the Supabase project

1. Open the Supabase project dashboard.
2. Open **Connect** (or **Settings → API Keys**).
3. Copy the project URL and the **publishable** key into `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Never put a secret key, service-role key, or database password in this file.

4. Open **SQL Editor** and run each file in `supabase/migrations/` once, in
   filename order. If the initial schema is already installed, run only newer
   migration files.
5. Open **Authentication → Users** and create your own email/password user.
6. Edit `supabase/bootstrap_admin.sql`, replacing `REPLACE_WITH_YOUR_EMAIL`, then
   paste it into the SQL Editor and run it once. This creates the trip and makes
   your account its first admin.
7. Restart `npm run dev` after creating or changing `.env.local`.

The migration creates a private `tickets` bucket with a 10 MB per-file limit.
Accepted formats are PDF, JPEG, PNG, and Apple Wallet pass files.

The route-city migration seeds London, Warsaw, Frankfurt an der Oder, Berlin,
Paris, Bordeaux, Hendaye, San Sebastián, Madrid, and Málaga. Members can still
add an emergency destination by entering its city and choosing its country;
the timezone is inferred automatically.

## Current state

Authentication and real Supabase itinerary loading are active once environment
variables and migrations are present. Members can add cities and basic located
events. Travel-event creation, editing, member management, notes, and ticket
upload UI are the next application slices.

## Security model

- Unauthenticated users have no table or ticket access.
- Trip members can collaborate on cities, events, and notes.
- A member sees tickets marked for everyone or assigned to their account.
- An admin sees every ticket belonging to the trip.
- Ticket files are private and governed by the same database-backed rules.
