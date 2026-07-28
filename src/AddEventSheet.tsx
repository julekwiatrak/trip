import { type FormEvent, useState } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { countryByCode, countryOptions, type SupportedCountryCode } from "./countryOptions";
import { createCity, createEvent, deleteEvent, updateEvent, type NewEvent } from "./tripData";
import type { City, EventType, ItineraryEvent, TransportMode } from "./types";
import { TicketSection } from "./TicketSection";
import type { Ticket, TripMember } from "./tripData";

type Props = {
  tripId: string;
  cities: City[];
  event?: ItineraryEvent;
  tickets?: Ticket[];
  members?: TripMember[];
  onClose: () => void;
  onChanged: () => Promise<void>;
};

const eventTypes: { value: EventType; label: string }[] = [
  { value: "travel", label: "Travel" },
  { value: "hotel-stay", label: "Hotel stay" },
  { value: "food-drink", label: "Food / drink" },
  { value: "other-activity", label: "Other activity" },
];

const transportModes: { value: Exclude<TransportMode, "other">; label: string }[] = [
  { value: "train", label: "Train" },
  { value: "flight", label: "Flight" },
  { value: "bus", label: "Bus" },
  { value: "taxi", label: "Taxi" },
];

function localValue(value: string | undefined, timeZone: string) {
  return value ? formatInTimeZone(value, timeZone, "yyyy-MM-dd'T'HH:mm") : "";
}

export function AddEventSheet({ tripId, cities, event: existing, tickets = [], members = [], onClose, onChanged }: Props) {
  const existingCity = existing?.type !== "travel" ? cities.find((city) => city.id === existing?.cityId) : undefined;
  const existingOrigin = existing?.type === "travel" ? cities.find((city) => city.id === existing.originCityId) : undefined;
  const existingDestination = existing?.type === "travel" ? cities.find((city) => city.id === existing.destinationCityId) : undefined;
  const [mode, setMode] = useState<"event" | "city">(cities.length ? "event" : "city");
  const [type, setType] = useState<EventType>(existing?.type ?? "other-activity");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [cityId, setCityId] = useState(existingCity?.id ?? cities[0]?.id ?? "");
  const [originCityId, setOriginCityId] = useState(existingOrigin?.id ?? cities[0]?.id ?? "");
  const [destinationCityId, setDestinationCityId] = useState(existingDestination?.id ?? cities[1]?.id ?? cities[0]?.id ?? "");
  const [transport, setTransport] = useState<Exclude<TransportMode, "other">>(existing?.type === "travel" && existing.transport !== "other" ? existing.transport : "train");
  const [startsAt, setStartsAt] = useState(localValue(existing?.startsAt, existingOrigin?.timeZone ?? existingCity?.timeZone ?? "Europe/London"));
  const [endsAt, setEndsAt] = useState(localValue(existing?.endsAt, existingDestination?.timeZone ?? existingCity?.timeZone ?? "Europe/London"));
  const [details, setDetails] = useState(existing?.details ?? "");
  const [cityName, setCityName] = useState("");
  const [countryCode, setCountryCode] = useState<SupportedCountryCode>("GB");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submitEvent = async (event: FormEvent) => {
    event.preventDefault();
    const city = cities.find((candidate) => candidate.id === cityId);
    const origin = cities.find((candidate) => candidate.id === originCityId);
    const destination = cities.find((candidate) => candidate.id === destinationCityId);
    if (type === "travel" && (!origin || !destination)) return setError("Choose departure and arrival cities.");
    if (type !== "travel" && !city) return setError("Choose a city first.");
    if (!endsAt) return setError("Every event needs an end time.");
    setSaving(true);
    setError(undefined);
    try {
      let input: NewEvent;
      if (type === "travel" && origin && destination) {
        input = {
          type,
          title,
          originCityId,
          destinationCityId,
          transport,
          startsAt: fromZonedTime(startsAt, origin.timeZone).toISOString(),
          endsAt: fromZonedTime(endsAt, destination.timeZone).toISOString(),
          ...(details ? { details } : {}),
        };
      } else if (type !== "travel" && city) {
        input = {
          type,
          title,
          cityId,
          startsAt: fromZonedTime(startsAt, city.timeZone).toISOString(),
          endsAt: fromZonedTime(endsAt, city.timeZone).toISOString(),
          ...(details ? { details } : {}),
        };
      } else return;

      if (new Date(input.endsAt) <= new Date(input.startsAt)) {
        throw new Error("The end time must be after the start time.");
      }
      if (input.type === "travel" && input.transport === "taxi" && input.originCityId !== input.destinationCityId) {
        throw new Error("Taxi journeys must start and finish in the same city.");
      }

      if (existing) await updateEvent(existing.id, input);
      else await createEvent(tripId, input);
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The event could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing || !window.confirm(`Delete “${existing.title}”? This cannot be undone.`)) return;
    setSaving(true);
    setError(undefined);
    try {
      await deleteEvent(existing.id);
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The event could not be deleted.");
      setSaving(false);
    }
  };

  const submitCity = async (event: FormEvent) => {
    event.preventDefault();
    const country = countryByCode(countryCode);
    if (!country) return setError("Choose a supported country.");
    setSaving(true);
    setError(undefined);
    try {
      await createCity(tripId, {
        name: cityName,
        countryCode: country.code,
        timeZone: country.timeZone,
      });
      await onChanged();
      setMode("event");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The city could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
      <div className="sheet edit-sheet" role="dialog" aria-modal="true" aria-label={mode === "event" ? existing ? "Edit event" : "Add event" : "Add city"} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">
          <h2>{mode === "event" ? existing ? "Edit event" : "Add event" : "Add city"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {mode === "event" ? (
          <form className="edit-form" onSubmit={submitEvent}>
            <label>Type<select value={type} onChange={(event) => setType(event.target.value as EventType)}>{eventTypes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            {type === "travel" ? (
              <>
                <label>Transport<select value={transport} onChange={(event) => setTransport(event.target.value as Exclude<TransportMode, "other">)}>{transportModes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <div className="form-pair">
                  <label>Departure city<select required value={originCityId} onChange={(event) => setOriginCityId(event.target.value)}><option value="" disabled>Choose</option>{cities.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}</select></label>
                  <label>Arrival city<select required value={destinationCityId} onChange={(event) => setDestinationCityId(event.target.value)}><option value="" disabled>Choose</option>{cities.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}</select></label>
                </div>
              </>
            ) : (
              <label>City<select required value={cityId} onChange={(event) => setCityId(event.target.value)}><option value="" disabled>Choose a city</option>{cities.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}</select></label>
            )}
            <button className="text-action" type="button" onClick={() => setMode("city")}>+ Add another city</button>
            <div className="form-pair">
              <label>Starts<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
              <label>{type === "travel" ? "Arrives" : "Ends"}<input type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
            </div>
            <label>Notes <small>optional</small><textarea rows={4} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action" disabled={saving}>{saving ? "Saving…" : existing ? "Save changes" : "Add event"}</button>
            {existing && <TicketSection tripId={tripId} eventId={existing.id} tickets={tickets} members={members} onChanged={onChanged} />}
            {existing && <button className="danger-action" type="button" disabled={saving} onClick={() => void remove()}>Delete event</button>}
          </form>
        ) : (
          <form className="edit-form" onSubmit={submitCity}>
            <label>City<input required value={cityName} onChange={(event) => setCityName(event.target.value)} /></label>
            <label>Country<select value={countryCode} onChange={(event) => setCountryCode(event.target.value as SupportedCountryCode)}>{countryOptions.map((country) => <option value={country.code} key={country.code}>{country.name}</option>)}</select></label>
            <p className="form-help">Timezone is set automatically from the country. Country is stored as metadata and will not clutter the timeline.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action" disabled={saving}>{saving ? "Saving…" : "Add city"}</button>
            {cities.length > 0 && <button className="text-action" type="button" onClick={() => setMode("event")}>Back to event</button>}
          </form>
        )}
      </div>
    </div>
  );
}
