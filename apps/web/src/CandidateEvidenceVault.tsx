import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { applyEvidenceSkills, createEvidence, deleteEvidence, listEvidence, type CandidateEvidence, type EvidenceInput } from "./lib/api";

const kinds: Array<{ value: CandidateEvidence["kind"]; label: string; description: string }> = [
  { value: "resume", label: "Résumé / CV", description: "Current role, projects and skills" },
  { value: "portfolio", label: "Portfolio", description: "GitHub, portfolio or work showcase" },
  { value: "certificate", label: "Certificate", description: "Course, licence or qualification" },
  { value: "employment", label: "Work evidence", description: "Previous company, internship or reference" },
  { value: "achievement", label: "Achievement", description: "Award, competition or measurable result" },
  { value: "offer_letter", label: "Offer letter", description: "Private record; never used for scoring" },
  { value: "project", label: "Project", description: "Project outcome and demonstrated skills" },
  { value: "other", label: "Other evidence", description: "Any relevant supporting record" },
];

const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);

async function fileInput(file: File): Promise<EvidenceInput["file"]> {
  if (!(["application/pdf", "image/png", "image/jpeg"] as string[]).includes(file.type)) throw new Error("Use a PDF, PNG or JPEG file.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose a file smaller than 2 MB.");
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("The file could not be read.")); reader.readAsDataURL(file); });
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("The file could not be read.");
  return { name: file.name, type: file.type as "application/pdf" | "image/png" | "image/jpeg", base64 };
}

export function CandidateEvidenceVault({ onSkillsApplied }: { onSkillsApplied: (skills: string[]) => void }) {
  const [items, setItems] = useState<CandidateEvidence[]>([]);
  const [kind, setKind] = useState<CandidateEvidence["kind"]>("resume");
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [skills, setSkills] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [file, setFile] = useState<EvidenceInput["file"]>();
  const [fileLabel, setFileLabel] = useState("");
  const [message, setMessage] = useState("Loading your private evidence vault…");
  const [saving, setSaving] = useState(false);

  useEffect(() => { let active = true; listEvidence().then((next) => { if (active) { setItems(next); setMessage(""); } }).catch((error: Error) => { if (active) setMessage(error.message); }); return () => { active = false; }; }, []);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try { const next = await fileInput(selected); setFile(next); setFileLabel(`${selected.name} (${Math.ceil(selected.size / 1024)} KB)`); setMessage(""); }
    catch (error) { setFile(undefined); setFileLabel(""); setMessage(error instanceof Error ? error.message : "The file could not be read."); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const item = await createEvidence({ kind, title, issuer, skills: split(skills), portfolioUrl: portfolioUrl || undefined, verificationUrl: verificationUrl || undefined, file });
      setItems((current) => [item, ...current]); setTitle(""); setIssuer(""); setSkills(""); setPortfolioUrl(""); setVerificationUrl(""); setFile(undefined); setFileLabel(""); setMessage("Evidence saved privately. Review its listed skills before adding them to your profile.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Evidence could not be saved."); }
    finally { setSaving(false); }
  }

  async function useSkills(id: string) {
    try { const merged = await applyEvidenceSkills(id); onSkillsApplied(merged); setMessage("Evidence skills were added to your profile. Save your profile and rerun ATS readiness when ready."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Skills could not be applied."); }
  }

  async function remove(id: string) {
    try { await deleteEvidence(id); setItems((current) => current.filter((item) => item.id !== id)); setMessage("Evidence record removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Evidence could not be removed."); }
  }

  return <section className="evidence-vault">
    <header><div><p className="small-label">EVIDENCE VAULT</p><h2>Bring evidence, not just claims.</h2><p>Add a portfolio link or privately attach a résumé, certificate, work record, achievement or offer letter. Files remain private and are not used automatically for ATS scoring.</p></div><span>{items.length} records</span></header>
    <form onSubmit={submit} className="evidence-form">
      <label>Evidence type<select value={kind} onChange={(event) => setKind(event.target.value as CandidateEvidence["kind"])}>{kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{kinds.find((option) => option.value === kind)?.description}</small></label>
      <label>Title<input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Google Data Analytics Certificate" /></label>
      <label>Issuer or organisation<input maxLength={160} value={issuer} onChange={(event) => setIssuer(event.target.value)} placeholder="Example: Coursera, previous employer" /></label>
      <label>Relevant skills<textarea value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="SQL, Excel, Power BI" /><small>Optional. You choose whether to add these to ATS later.</small></label>
      <label>Portfolio or evidence link<input type="url" value={portfolioUrl} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://github.com/your-name" /></label>
      <label>Credential verification link<input type="url" value={verificationUrl} onChange={(event) => setVerificationUrl(event.target.value)} placeholder="https://issuer.example/verify/..." /></label>
      <label className="wide">Private attachment (PDF, PNG or JPEG; 2 MB maximum)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={chooseFile} /><small>{fileLabel || "Optional. Do not upload identity documents, bank details, passwords or other unnecessary sensitive data."}</small></label>
      <button disabled={saving}>{saving ? "Saving evidence…" : "Add evidence"}</button>
    </form>
    {message && <p className={message.startsWith("Evidence") ? "governance-message success" : "governance-message"}>{message}</p>}
    <div className="evidence-list">{items.map((item) => <article key={item.id}><div><span>{kinds.find((option) => option.value === item.kind)?.label}</span><h3>{item.title}</h3><p>{item.issuer || "Self-attested evidence"}{item.fileName ? ` · ${item.fileName}` : ""}</p>{item.skills.length > 0 && <p className="evidence-skills">{item.skills.map((skill) => <b key={skill}>{skill}</b>)}</p>}{item.portfolioUrl && <a href={item.portfolioUrl} target="_blank" rel="noreferrer">Open link ↗</a>}</div><aside><small>{item.verificationStatus.replace("_", " ")}</small>{item.skills.length > 0 && <button type="button" onClick={() => useSkills(item.id)}>Use listed skills</button>}<button type="button" className="danger" onClick={() => remove(item.id)}>Remove</button></aside></article>)}{!items.length && <p className="evidence-empty">No evidence records yet. Start with a résumé, certificate, portfolio or project.</p>}</div>
  </section>;
}
