import { useEffect, useMemo, useState } from "react";
import { AddEventSheet } from "./AddEventSheet";
import { deferCalendarImport, loadCalendarImports, type CalendarImport, type TripData } from "./tripData";

export function CalendarReviewSheet({ data, onClose, onChanged }: { data: TripData; onClose: () => void; onChanged: () => Promise<void> }) {
  const [imports, setImports] = useState<CalendarImport[]>();
  const [currentId, setCurrentId] = useState<string>();
  const [error, setError] = useState<string>();
  const ordered = useMemo(() => imports ? [...imports].sort((a, b) => Number(a.status === "ignored") - Number(b.status === "ignored")) : [], [imports]);
  const current = ordered.find((item) => item.id === currentId) ?? ordered[0];

  const reload = async (skipId?: string) => {
    const result = await loadCalendarImports(data.tripId);
    setImports(result);
    setCurrentId((id) => {
      if (!skipId && result.some((item) => item.id === id)) return id;
      return result.find((item) => item.id !== skipId)?.id ?? result[0]?.id;
    });
  };

  useEffect(() => {
    let active = true;
    void loadCalendarImports(data.tripId)
      .then((result) => {
        if (!active) return;
        setImports(result);
        setCurrentId(result[0]?.id);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load calendar events.");
      });
    return () => { active = false; };
  }, [data.tripId]);

  if (error) return <div className="sheet-layer"><div className="sheet"><div className="sheet-title"><h2>Review calendar events</h2><button onClick={onClose}>×</button></div><p className="form-error">{error}</p></div></div>;
  if (!imports) return <div className="sheet-layer"><div className="sheet"><p>Loading calendar events…</p></div></div>;
  if (!current) return <div className="sheet-layer"><div className="sheet"><div className="sheet-title"><h2>Calendar reviewed</h2><button onClick={onClose}>×</button></div><p className="form-help">Every discovered event has been added to the itinerary.</p><button className="review-finish" onClick={onClose}>Done</button></div></div>;

  const position = ordered.findIndex((item) => item.id === current.id) + 1;
  return <>
    <AddEventSheet
      key={current.id}
      tripId={data.tripId}
      cities={data.cities}
      calendarImport={current}
      calendarId={data.calendarConnection?.calendarId ?? ""}
      onClose={onClose}
      onChanged={onChanged}
      onProcessed={() => reload(current.id)}
    />
    <div className="review-controls">
      <span>{position} / {ordered.length}</span>
      <button onClick={() => void deferCalendarImport(current.id).then(() => reload(current.id)).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not defer event."))}>Ignore for now</button>
    </div>
  </>;
}
