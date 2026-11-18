import { useEffect, useState } from "react";
import { listAccessRequests, listAuditEvents, resolveAccessRequest, type AccessRequest, type AuditEventItem } from "./lib/api";

export function AdminConsole({ initialTab = "overview", onClose }: { initialTab?: "overview" | "audit"; onClose: () => void }) {
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [auditItems, setAuditItems] = useState<AuditEventItem[]>([]);
  const [message, setMessage] = useState("Loading platform governance data…");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      const [requests, audits] = await Promise.all([
        listAccessRequests(),
        listAuditEvents().catch(() => [] as AuditEventItem[]),
      ]);
      setItems(requests);
      setAuditItems(audits);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The governance data could not be loaded.");
    }
  };
  useEffect(() => { void load(); }, []);

  async function decide(item: AccessRequest, decision: "approve" | "reject") {
    setBusy(item.userId);
    try {
      await resolveAccessRequest(item.userId, decision, note || undefined);
      setNote("");
      setItems((current) => current.filter((request) => request.userId !== item.userId));
      setMessage(`${item.name}'s request was ${decision === "approve" ? "approved" : "rejected"}. The action is recorded in the audit trail.`);
      const audits = await listAuditEvents().catch(() => auditItems);
      setAuditItems(audits);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request could not be resolved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="admin-console">
      <header className="candidate-header">
        <div>
          <p className="eyebrow">PLATFORM GOVERNANCE</p>
          <h1>Operate with<br /><em>clear accountability.</em></h1>
          <p>Approve verified organisation access, preserve an audit record and keep each tenant isolated.</p>
        </div>
        <div className="profile-meter">
          <span>{initialTab === "audit" ? auditItems.length : items.length}</span>
          <strong>{initialTab === "audit" ? "recent audit events" : "pending requests"}</strong>
          <small>Only platform administrators can perform these actions.</small>
          <button onClick={onClose}>Return to workspace</button>
        </div>
      </header>
      {message && <p className="governance-message">{message}</p>}
      <section className="applicant-queue">
        <div className="section-row">
          <div>
            <p className="small-label">{initialTab === "audit" ? "RECENT GOVERNANCE" : "ACCESS APPROVAL"}</p>
            <h2>{initialTab === "audit" ? "Immutable platform audit log." : "Review organisation requests."}</h2>
          </div>
        </div>
        {initialTab === "audit" ? (
          auditItems.length ? auditItems.map((event) => (
            <article className="applicant-record" key={event.id}>
              <div>
                <span className="status-pill status-submitted">{event.action}</span>
                <h3>{event.entityType}{event.organisationName ? ` · ${event.organisationName}` : ""}</h3>
                <p>{event.actorName ? `${event.actorName} (${event.actorEmail ?? "system"})` : event.actorEmail ?? "System action"}</p>
                <small>{new Date(event.createdAt).toLocaleString()}{event.entityId ? ` · ref ${event.entityId.slice(0, 8)}` : ""}</small>
              </div>
            </article>
          )) : <p className="empty-state">No audit events recorded yet.</p>
        ) : (
          <>
            <label>Review note (optional, stored in the audit event)<input maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Verification reference or reason" /></label>
            {items.length ? items.map((item) => (
              <article className="applicant-record" key={item.userId}>
                <div>
                  <span className="status-pill status-submitted">pending</span>
                  <h3>{item.name}</h3>
                  <p>{item.role.replace(/_/g, " ")} · {item.organisationName} ({item.kind})</p>
                  <small>{item.email} · requested {new Date(item.requestedAt).toLocaleDateString()}</small>
                </div>
                <div className="applicant-actions">
                  <button className="approve" disabled={busy === item.userId} onClick={() => decide(item, "approve")}>{busy === item.userId ? "Saving…" : "Approve"}</button>
                  <button className="danger-outline" disabled={busy === item.userId} onClick={() => decide(item, "reject")}>Reject</button>
                </div>
              </article>
            )) : <p className="empty-state">No pending organisation requests. New elevated registrations will appear here for verification.</p>}
          </>
        )}
      </section>
    </section>
  );
}
