import { useState } from "react";
import { updateDisplayName, type TripData } from "./tripData";

export function TravellersSheet({ data, onClose, onChanged }: { data: TripData; onClose: () => void; onChanged: () => Promise<void> }) {
  const [ownName, setOwnName] = useState(data.displayName);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setSaving(true); setError(undefined);
    try { await action(); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The change could not be saved."); }
    finally { setSaving(false); }
  };

  return <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
    <div className="sheet edit-sheet" role="dialog" aria-modal="true" aria-label="Travellers" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="sheet-title"><h2>Travellers</h2><button onClick={onClose} aria-label="Close">×</button></div>
      <form className="edit-form" onSubmit={(event) => { event.preventDefault(); void run(() => updateDisplayName(ownName)); }}>
        <label>Your name<input required value={ownName} onChange={(event) => setOwnName(event.target.value)} /></label>
        <button className="text-action" disabled={saving}>Save name</button>
      </form>
      <div className="traveller-list">{data.members.map((member) => <p key={member.userId}><span>{member.displayName}</span><small>{member.role}</small></p>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </div>;
}
