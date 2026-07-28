import { useState } from "react";
import { listGoogleCalendars, selectGoogleCalendar, type EditableGoogleCalendar, type TripData } from "./tripData";

export function CalendarSettings({ data, onChanged }: { data: TripData; onChanged: () => Promise<void> }) {
  const [calendars, setCalendars] = useState<EditableGoogleCalendar[]>();
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const connection = data.calendarConnection;
  if (!connection) return null;

  const load = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const available = await listGoogleCalendars(data.tripId);
      setCalendars(available);
      setSelectedId(connection.calendarId ?? available.find((calendar) => !calendar.primary)?.id ?? available[0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load calendars.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(undefined);
    try {
      await selectGoogleCalendar(data.tripId, selectedId);
      await onChanged();
      setCalendars(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not select the calendar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="calendar-picker">
      {connection.calendarName ? <p><span>Trip calendar</span>{connection.calendarName}</p> : <p>No trip calendar selected yet.</p>}
      {!calendars ? (
        <button disabled={busy} onClick={() => void load()}>{busy ? "Loading calendars…" : connection.calendarId ? "Change calendar" : "Choose trip calendar"}</button>
      ) : (
        <div className="calendar-choice">
          <label htmlFor="trip-google-calendar">Calendar</label>
          <select id="trip-google-calendar" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {calendars.map((calendar) => <option value={calendar.id} key={calendar.id}>{calendar.name}{calendar.primary ? " (primary)" : ""}</option>)}
          </select>
          <button disabled={busy || !selectedId} onClick={() => void save()}>{busy ? "Saving…" : "Use this calendar"}</button>
        </div>
      )}
      {error && <p className="calendar-message">{error}</p>}
    </div>
  );
}
