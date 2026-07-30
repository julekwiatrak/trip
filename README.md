# Trip

A private, mobile-first itinerary for a multi-city European rail trip. It was
built as a practical TypeScript learning project: instead of reproducing a
calendar, it answers the immediate travel questions **what is happening now,
what is next, and what do I need to know?**

The deployed app contains private travel documents and is therefore protected
by authentication. This repository documents the implementation without
exposing traveller data or credentials.

## What it does

- Organises the itinerary into expandable **Earlier / Now / Next / Later**
  sections.
- Navigates to events by date or city, with route-aware matching.
- Models activities, hotel stays, food/drink and travel by train, flight, bus
  or taxi.
- Displays departure and arrival in their respective local timezones.
- Stores shared notes and private or group tickets.
- Installs as a PWA on Android and iPhone and works with a cached app shell.
- Imports events from a selected Google Calendar through a review and
  classification queue.
- Pushes events created or edited in the app to Google Calendar.
- Shows current and event-time weather using a cached Open-Meteo forecast.

## Technology

| Area | Technology | Purpose |
| --- | --- | --- |
| Language | TypeScript | Typed domain models, UI and server functions |
| Front end | React | Component-based mobile interface and state |
| Build tooling | Vite | Local development and production builds |
| Styling | CSS | Responsive layout, bottom sheets and custom minimalist icons |
| Backend | Supabase | PostgreSQL, authentication, Row Level Security and private file storage |
| Server code | Supabase Edge Functions / Deno | Google OAuth, encrypted token handling and calendar sync |
| Dates | date-fns / date-fns-tz | UTC storage and city-local rendering |
| Calendar | Google Calendar API / OAuth 2.0 | Calendar selection, event import and app-to-calendar push |
| Weather | Open-Meteo | Batched current and hourly forecasts with no client secret |
| PWA | vite-plugin-pwa / Workbox | Manifest, installability and app-shell caching |
| Hosting | GitHub Pages / Actions | Free automated front-end deployment |

## Technical highlights

### Timezone-safe travel

Supabase stores event timestamps as UTC instants. The interface formats a
normal event in its city's IANA timezone. A travel event independently formats
departure in the origin timezone and arrival in the destination timezone. The
same distinction is sent to Google Calendar, so a London-to-Berlin journey can
have `Europe/London` on its start and `Europe/Berlin` on its end.

### Calendar integration

Google OAuth refresh tokens never enter the browser or GitHub repository. They
are encrypted by an Edge Function before storage. Only an admin can connect an
account, select the shared calendar or run a manual import. New Google events
are staged for classification rather than guessed into the itinerary. Events
created in the app carry private linking metadata so later syncs do not import
them again.

### Database security

PostgreSQL Row Level Security is the primary access boundary:

- unauthenticated users cannot read trip data;
- members can collaborate on events and shared notes;
- users see tickets assigned to them or to everyone;
- admins can see all trip tickets and delete events;
- ticket files live in a private Storage bucket and are downloaded through
  short-lived signed URLs;
- server credentials and third-party tokens are restricted to Edge Functions.

### Weather without clutter

City coordinates are stored alongside IANA timezones. Weather for all cities is
requested in one batch and cached for 45 minutes. Located events use their
start time; travel events use departure and arrival independently. Forecasts
outside the available range remain hidden rather than showing unrelated
current conditions.

## Repository structure

```text
src/
  App.tsx                    main timeline and navigation
  AddEventSheet.tsx          create, edit and classify events
  CalendarSettings.tsx      calendar connection controls
  CalendarReviewSheet.tsx   staged Google-event review
  timeline.ts               Earlier / Now / Next / Later calculations
  tripData.ts               typed Supabase data-access layer
  weather.tsx               forecast fetching, caching and icons

supabase/
  functions/                Google OAuth and calendar server functions
  migrations/               schema, policies and incremental changes

.github/workflows/          GitHub Pages deployment
```

## Run locally

Requirements: Node.js, npm and a Supabase project.

```sh
npm install
npm run dev
```

Create `.env.local` with the browser-safe Supabase values:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Run the SQL files in `supabase/migrations/` in filename order, create an
email/password user, then use `supabase/bootstrap_admin.sql` to create the trip
and initial admin membership. Google Calendar integration additionally needs a
Google Cloud OAuth client and the documented Edge Function secrets; no secret
belongs in `.env.local`.

## Quality checks

```sh
npm run build
npm run lint
```

The production workflow runs the TypeScript build and publishes the generated
PWA to GitHub Pages. Supabase remains the authenticated backend; GitHub Pages
only hosts static browser assets.

## Scope and trade-offs

This is a purpose-built application rather than a general travel platform.
Cities and travellers are managed for one shared trip, Google sync is manually
triggered to make external changes deliberate, and forecasts are only shown
when Open-Meteo has data for the relevant hour. The narrow scope allowed the
project to focus on typed modelling, timezone correctness, authentication,
database policies and third-party API integration.
