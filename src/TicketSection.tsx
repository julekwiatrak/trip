import { useState } from "react";
import { deleteTicket, downloadTicket, uploadTicket, type Ticket, type TripMember } from "./tripData";

export function TicketSection({ tripId, eventId, tickets, members, onChanged }: { tripId: string; eventId: string; tickets: Ticket[]; members: TripMember[]; onChanged: () => Promise<void> }) {
  const [file, setFile] = useState<File>();
  const [assignment, setAssignment] = useState("everyone");
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError(undefined);
    try { await action(); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The ticket operation failed."); }
    finally { setWorking(false); }
  };

  const submit = async () => {
    if (!file) return setError("Choose a ticket file.");
    await run(() => uploadTicket({ tripId, eventId, file, assignedTo: assignment === "everyone" ? null : assignment }));
    setFile(undefined);
  };

  return <section className="tickets-section">
    <h3>Tickets</h3>
    {tickets.length === 0 && <p className="form-help">No tickets visible to you.</p>}
    <div className="ticket-list">{tickets.map((ticket) => {
      const owner = members.find((member) => member.userId === ticket.assignedTo);
      return <div key={ticket.id}>
        <button type="button" onClick={() => void run(() => downloadTicket(ticket))}><span>↓</span><span>{ticket.fileName}<small>{ticket.audience === "everyone" ? "Everyone" : owner?.displayName ?? "Individual"}</small></span></button>
        <button className="ticket-delete" type="button" aria-label={`Delete ${ticket.fileName}`} onClick={() => { if (window.confirm(`Delete “${ticket.fileName}”?`)) void run(() => deleteTicket(ticket)); }}>×</button>
      </div>;
    })}</div>
    <div className="ticket-form">
      <label>File<input type="file" accept="application/pdf,image/jpeg,image/png,application/vnd.apple.pkpass" onChange={(event) => setFile(event.target.files?.[0])} /></label>
      <label>For<select value={assignment} onChange={(event) => setAssignment(event.target.value)}><option value="everyone">Everyone</option>{members.map((member) => <option value={member.userId} key={member.userId}>{member.displayName}</option>)}</select></label>
      <button className="text-action" type="button" disabled={working} onClick={() => void submit()}>{working ? "Uploading…" : "+ Add ticket"}</button>
    </div>
    {assignment !== "everyone" && <p className="form-help">Only that traveller and the admin will be able to see this ticket.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
