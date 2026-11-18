import { FormEvent, useEffect, useState } from "react";
import { AtsReadinessPanel } from "./AtsReadinessPanel";
import { CandidateEvidenceVault } from "./CandidateEvidenceVault";
import { getCandidateProfile, saveCandidateProfile, type CandidateProfile } from "./lib/api";

type CandidateRole = "school_student" | "college_student" | "job_seeker";
const stages: Record<CandidateRole, string> = { school_student: "School exploration", college_student: "College placement", job_seeker: "Professional search" };
const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 40);

export function CandidateProfilePage({ role }: { role: CandidateRole }) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [headline, setHeadline] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState("");
  const [targets, setTargets] = useState("");
  const [locations, setLocations] = useState("");
  const [visibility, setVisibility] = useState<CandidateProfile["visibility"]>("private");
  const [message, setMessage] = useState("Loading your private profile…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCandidateProfile().then((next) => {
      if (!mounted) return;
      setProfile(next); setHeadline(next.headline); setLocation(next.location); setSkills(next.skills.join(", "));
      setTargets((next.preferences.targetRoles ?? []).join(", ")); setLocations((next.preferences.preferredLocations ?? []).join(", "));
      setVisibility(next.visibility); setMessage("");
    }).catch((error: Error) => { if (mounted) setMessage(error.message); });
    return () => { mounted = false; };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const next = await saveCandidateProfile({ headline, location, skills: split(skills), preferences: { targetRoles: split(targets), preferredLocations: split(locations) }, visibility });
      setProfile(next); setVisibility(next.visibility); setMessage("Saved. Your profile evidence is now available to your guidance and application workflow.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your profile could not be saved."); }
    finally { setSaving(false); }
  }

  return <section className="candidate-profile-page">
    <header className="profile-page-header"><div><p className="eyebrow">PROFILE EVIDENCE</p><h1>Build a profile you control.</h1><p>Accurate details improve relevant guidance. Your profile is private unless you make a deliberate visibility choice.</p></div><div className="profile-readiness"><strong>{profile ? "Active" : "Loading"}</strong><span>{stages[role]}</span></div></header>
    <form className="candidate-profile-form" onSubmit={save}>
      <section><p className="small-label">CAREER DIRECTION</p><h2>Make your next goal understandable.</h2><div className="profile-field-grid"><label className="wide">Career headline<input required maxLength={180} value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Example: Entry-level full-stack developer" /></label><label>Preferred location<input maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Chennai, Remote, Bengaluru" /></label><label>Skills<textarea value={skills} onChange={(event) => setSkills(event.target.value)} maxLength={1500} placeholder="React, Java, communication, data analysis" /><small>Separate each skill with a comma.</small></label></div></section>
      <section><p className="small-label">OPPORTUNITY PREFERENCES</p><h2>Define what relevant means to you.</h2><div className="profile-field-grid"><label className="wide">Target roles or pathways<textarea value={targets} onChange={(event) => setTargets(event.target.value)} maxLength={1500} placeholder="Frontend developer, software engineering internship" /></label><label className="wide">Preferred locations<textarea value={locations} onChange={(event) => setLocations(event.target.value)} maxLength={1500} placeholder="Chennai, Bengaluru, Remote" /></label></div></section>
      <section><p className="small-label">PRIVACY</p><h2>Choose how your profile is used.</h2>{role === "school_student" ? <div className="privacy-selection"><strong>Private profile enforced</strong><p>School-student records are private. Wider sharing requires a future verified guardian-consent process.</p></div> : <div className="visibility-options">{[{ value: "private", title: "Private", copy: "Only you see this profile until you submit an application." }, { value: "application_only", title: "Application only", copy: "A hiring team can see information included with an application." }, { value: "discoverable", title: "Discoverable", copy: "Authorised recruiters may discover this profile under platform rules." }].map((choice) => <label className={visibility === choice.value ? "active" : ""} key={choice.value}><input type="radio" name="visibility" value={choice.value} checked={visibility === choice.value} onChange={() => setVisibility(choice.value as CandidateProfile["visibility"])} /><span><strong>{choice.title}</strong><small>{choice.copy}</small></span></label>)}</div>}</section>
      {message && <p className={message.startsWith("Saved") ? "governance-message success" : "governance-message"}>{message}</p>}
      <footer><button disabled={saving}>{saving ? "Saving profile…" : "Save profile evidence"}</button><span>FairMatch does not infer sensitive attributes or make automatic decisions from this information.</span></footer>
    </form>
    <CandidateEvidenceVault onSkillsApplied={(nextSkills) => setSkills(nextSkills.join(", "))} />
    <AtsReadinessPanel />
  </section>;
}
