import { FormEvent, useEffect, useState } from "react";
import {
  changeAccountPassword,
  createPrivacyRequest,
  exportAccountData,
  listPrivacyRequests,
  type PrivacyRequestItem,
} from "./lib/api";
import type { WorkspaceRole } from "./WorkspaceShell";

export function AccountSettings({ role, email }: { role: WorkspaceRole; email: string }) {
  const [requests, setRequests] = useState<PrivacyRequestItem[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function loadRequests() {
    try {
      setRequests(await listPrivacyRequests());
    } catch {
      // Ignore if migration 003 not yet applied
    }
  }

  useEffect(() => { void loadRequests(); }, []);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await changeAccountPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated. Other active sessions were signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadJsonExport() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await exportAccountData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fairmatch-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your FairMatch account data export has been downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data export could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrivacyRequest(requestType: "export" | "deletion") {
    setBusy(true);
    setMessage("");
    try {
      await createPrivacyRequest(requestType);
      setMessage(`Your ${requestType} request has been logged for review.`);
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Privacy request could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-settings">
      <header>
        <div>
          <p className="eyebrow">ACCOUNT, SECURITY & PRIVACY</p>
          <h1>Your access.<br /><em>Your control.</em></h1>
          <p>FairMatch keeps authentication, approval status and privacy controls separate from routine workspace activity.</p>
        </div>
        <aside>
          <span>{email.slice(0, 1).toUpperCase()}</span>
          <strong>{email}</strong>
          <small>{role.replace(/_/g, " ")}</small>
        </aside>
      </header>
      {message && <p className="governance-message" role="status">{message}</p>}
      <div className="account-settings-grid">
        <section>
          <p className="small-label">ACCOUNT SECURITY</p>
          <h2>Secure account controls</h2>
          <div className="account-facts">
            <article><span>Authentication</span><strong>Email and password</strong></article>
            <article><span>Session handling</span><strong>Short-lived signed tokens</strong></article>
            <article><span>Current role</span><strong>{role.replace(/_/g, " ")}</strong></article>
          </div>
          <form className="password-change-form" onSubmit={updatePassword}>
            <label>Current password<input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
            <label>New password (12+ characters)<input type="password" required minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
            <button disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
          </form>
        </section>
        <section>
          <p className="small-label">PRIVACY RIGHTS</p>
          <h2>Export or manage your account data.</h2>
          <div className="privacy-request-actions">
            <article>
              <div><strong>Download your data now</strong><p>Export a JSON copy of your profile, evidence metadata and applications.</p></div>
              <button type="button" disabled={busy} onClick={downloadJsonExport}>Download JSON</button>
            </article>
            <article>
              <div><strong>Request a formal data export</strong><p>Log a reviewed export request in your privacy history.</p></div>
              <button type="button" disabled={busy} onClick={() => submitPrivacyRequest("export")}>Request export</button>
            </article>
            <article>
              <div><strong>Request account deletion</strong><p>A platform review identifies records that must be retained for security or legal obligations.</p></div>
              <button type="button" className="danger-outline" disabled={busy} onClick={() => submitPrivacyRequest("deletion")}>Request deletion</button>
            </article>
          </div>
        </section>
      </div>
      <section className="privacy-request-history">
        <p className="small-label">PRIVACY REQUEST HISTORY</p>
        <h2>Recorded privacy requests</h2>
        {requests.length ? (
          <div className="recent-applications">
            {requests.map((req) => (
              <article key={req.id}>
                <div>
                  <span className={`status-pill status-${req.status}`}>{req.status}</span>
                  <h3>Account {req.requestType} request</h3>
                  <p>Submitted {new Date(req.createdAt).toLocaleString()}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No formal privacy requests submitted yet.</p>
        )}
      </section>
    </section>
  );
}
