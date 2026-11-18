import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type CandidateDocument = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  is_primary: boolean;
  status: "uploaded" | "verified" | "rejected";
  verification_note: string | null;
  created_at: string;
};
const allowedDocumentTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function validateCandidateDocument(
  file: Pick<File, "name" | "size" | "type">,
) {
  if (!allowedDocumentTypes.has(file.type)) return "Upload a PDF or DOCX file.";
  if (file.size < 1) return "The selected file is empty.";
  if (file.size > 5 * 1024 * 1024)
    return "The document must be 5 MB or smaller.";
  if (!/\.(pdf|docx)$/i.test(file.name))
    return "The filename must end in .pdf or .docx.";
  return null;
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const safeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);

export function CandidateDocuments() {
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [message, setMessage] = useState("Loading private documents…");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("candidate_documents")
      .select(
        "id, file_name, storage_path, mime_type, size_bytes, is_primary, status, verification_note, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(
        error.code === "42P01"
          ? "Apply migration 013 to activate the private document vault."
          : error.message,
      );
      return;
    }
    setDocuments((data ?? []) as CandidateDocument[]);
    setMessage("");
  }
  useEffect(() => {
    void load();
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase) return;
    const validation = validateCandidateDocument(file);
    if (validation) {
      setMessage(validation);
      return;
    }
    setBusy(true);
    setMessage("Encrypting transfer to your private vault…");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setBusy(false);
      setMessage("Sign in again before uploading.");
      return;
    }
    const storagePath = `${authData.user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const uploaded = await supabase.storage
      .from("candidate-documents")
      .upload(storagePath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploaded.error) {
      setBusy(false);
      setMessage(uploaded.error.message);
      return;
    }
    const inserted = await supabase
      .from("candidate_documents")
      .insert({
        profile_id: authData.user.id,
        kind: "resume",
        file_name: file.name.slice(0, 180),
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        is_primary: documents.length === 0,
      })
      .select("id")
      .single();
    if (inserted.error) {
      await supabase.storage.from("candidate-documents").remove([storagePath]);
      setBusy(false);
      setMessage(inserted.error.message);
      return;
    }
    setBusy(false);
    setMessage(
      "Resume stored privately. Only you and an authorised hiring team for an attached application can access it.",
    );
    await load();
  }

  async function setPrimary(document: CandidateDocument) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_primary_candidate_document", {
      document_id: document.id,
    });
    setBusy(false);
    setMessage(error ? error.message : "Primary resume updated.");
    if (!error) await load();
  }

  async function openDocument(document: CandidateDocument) {
    if (!supabase) return;
    setBusy(true);
    setMessage("Creating a short-lived secure link…");
    const { data, error } = await supabase.storage
      .from("candidate-documents")
      .createSignedUrl(document.storage_path, 60);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setMessage("Secure link created for 60 seconds.");
  }

  async function removeDocument(document: CandidateDocument) {
    if (
      !supabase ||
      !window.confirm(`Remove ${document.file_name} from your private vault?`)
    )
      return;
    setBusy(true);
    setMessage("");
    const removedFile = await supabase.storage
      .from("candidate-documents")
      .remove([document.storage_path]);
    if (removedFile.error) {
      setBusy(false);
      setMessage(removedFile.error.message);
      return;
    }
    const removedRecord = await supabase
      .from("candidate_documents")
      .delete()
      .eq("id", document.id);
    setBusy(false);
    setMessage(
      removedRecord.error
        ? removedRecord.error.message
        : "Document removed. Existing applications no longer expose this resume.",
    );
    await load();
  }

  return (
    <section className="candidate-documents">
      <div className="document-heading">
        <div>
          <p className="small-label">PRIVATE DOCUMENT VAULT</p>
          <h2>Keep application evidence under your control.</h2>
          <p>
            Files remain private. A hiring team receives access only when that
            resume is explicitly attached to an application.
          </p>
        </div>
        <label className={busy ? "disabled" : ""}>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            onChange={upload}
          />
          <span>{busy ? "Please wait…" : "Upload résumé"}</span>
          <small>PDF or DOCX · maximum 5 MB</small>
        </label>
      </div>
      {message && (
        <p className="governance-message" role="status">
          {message}
        </p>
      )}
      <div className="document-list">
        {documents.length ? (
          documents.map((document) => (
            <article key={document.id}>
              <div className="document-icon">
                {document.mime_type === "application/pdf" ? "PDF" : "DOCX"}
              </div>
              <div>
                <header>
                  <strong>{document.file_name}</strong>
                  {document.is_primary && <span>Primary</span>}
                  {document.status !== "uploaded" && (
                    <span className={`document-${document.status}`}>
                      {document.status}
                    </span>
                  )}
                </header>
                <p>
                  {formatSize(document.size_bytes)} · Uploaded{" "}
                  {new Date(document.created_at).toLocaleDateString()}
                </p>
                {document.verification_note && (
                  <small>{document.verification_note}</small>
                )}
              </div>
              <div className="document-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openDocument(document)}
                >
                  Open securely
                </button>
                {!document.is_primary && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPrimary(document)}
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  className="danger-outline"
                  disabled={busy}
                  onClick={() => removeDocument(document)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="profile-empty">
            <strong>No résumé stored yet.</strong>
            <p>
              Upload a PDF or DOCX when you are ready to attach evidence to
              applications.
            </p>
          </div>
        )}
      </div>
      <aside>
        <strong>Privacy by design</strong>
        <span>Private bucket</span>
        <span>Short-lived download links</span>
        <span>Role-checked employer access</span>
        <span>No public file URL</span>
      </aside>
    </section>
  );
}
