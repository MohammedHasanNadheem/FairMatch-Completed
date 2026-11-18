import { FormEvent, useState } from "react";
import { loginAccount, loginPortal, registerAccount, type ApiRole, type ApiUser } from "./lib/api";

export type AuthMode = "sign-in" | "register";
type RequestedRole = Exclude<ApiRole, "platform_admin">;
type Props = { mode: AuthMode; onClose: () => void; onSwitch: (mode: AuthMode) => void; onAuthenticated: (user: ApiUser) => void };

const roleOptions: Array<{ value: RequestedRole; label: string; approval: boolean }> = [
  { value: "school_student", label: "School student", approval: false },
  { value: "college_student", label: "College student", approval: false },
  { value: "job_seeker", label: "Experienced job seeker", approval: false },
  { value: "college_coordinator", label: "College placement coordinator", approval: true },
  { value: "college_admin", label: "College administrator", approval: true },
  { value: "company_hr", label: "Company HR", approval: true },
  { value: "company_admin", label: "Company administrator", approval: true },
];

const portalLogins: Array<{ role: ApiRole; label: string; group: string }> = [
  { role: "school_student", label: "School student", group: "Candidate" },
  { role: "college_student", label: "College student", group: "Candidate" },
  { role: "job_seeker", label: "Job seeker", group: "Candidate" },
  { role: "college_coordinator", label: "College coordinator", group: "College" },
  { role: "college_admin", label: "College admin", group: "College" },
  { role: "company_hr", label: "Company HR", group: "Company" },
  { role: "company_admin", label: "Company admin", group: "Company" },
  { role: "platform_admin", label: "Platform admin", group: "Platform" },
];

/** Preserves a clear response when an identity provider says the email already exists. */
export function signUpNeedsExistingAccountHelp(sessionCreated: boolean, identitiesCount: number) {
  return !sessionCreated && identitiesCount === 0;
}

export function AuthDialog({ mode, onClose, onSwitch, onAuthenticated }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RequestedRole>("college_student");
  const [organisation, setOrganisation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const selectedRole = roleOptions.find((option) => option.value === role)!;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setPending(true);
    try {
      const normalisedEmail = email.trim().toLowerCase();
      if (mode === "sign-in") {
        onAuthenticated(await loginAccount(normalisedEmail, password));
        onClose();
        return;
      }
      const result = await registerAccount({
        fullName: fullName.trim(),
        email: normalisedEmail,
        password,
        requestedRole: role,
        organisationName: selectedRole.approval ? organisation.trim() : undefined,
      });
      setMessage(result.accountStatus === "pending_approval"
        ? "Your organisation-access request has been created. A FairMatch platform administrator can approve it in Access & organisations."
        : "Your account has been created. You can sign in now."
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "We could not complete that request.");
    } finally { setPending(false); }
  }

  async function signInToPortal(portalRole: ApiRole) {
    setMessage("");
    setPending(true);
    try {
      const user = await loginPortal(portalRole);
      onAuthenticated(user);
      onClose();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Portal sign-in could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return <div className="modal-backdrop" role="presentation"><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button className="close" onClick={onClose} aria-label="Close">×</button>
    <p className="eyebrow">{mode === "sign-in" ? "WELCOME BACK" : "CREATE YOUR ACCOUNT"}</p>
    <h2 id="auth-title">{mode === "sign-in" ? "Sign in to FairMatch." : "Start with the portal that fits you."}</h2>
    <p className="auth-copy">{mode === "sign-in" ? "Sign in with your account or choose a FairMatch portal below." : "Organisation roles remain pending until a platform administrator verifies the organisation."}</p>

    {mode === "sign-in" && (
      <div className="portal-login-section">
        <p className="small-label">SIGN IN BY PORTAL</p>
        <div className="portal-login-grid">
          {portalLogins.map((portal) => (
            <button
              key={portal.role}
              type="button"
              className="portal-login-button"
              disabled={pending}
              onClick={() => signInToPortal(portal.role)}
            >
              <small>{portal.group}</small>
              <strong>{portal.label}</strong>
            </button>
          ))}
        </div>
      </div>
    )}

    <form onSubmit={submit}>
      {mode === "register" && <label>Full name<input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>}
      <label>Work or personal email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <label>Password<input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label>
      {mode === "register" && <><label>I need access as<select value={role} onChange={(event) => setRole(event.target.value as RequestedRole)}>{roleOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        {selectedRole.approval && <label>College or company name<input required minLength={2} maxLength={160} value={organisation} onChange={(event) => setOrganisation(event.target.value)} /></label>}
        {selectedRole.approval && <p className="approval-note">This access request is reviewed by the platform team. Your account cannot grant itself an elevated role.</p>}</>}
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="submit-auth" disabled={pending}>{pending ? "Please wait…" : mode === "sign-in" ? "Sign in with email" : "Create account"}</button>
    </form>
    <p className="switch-auth">{mode === "sign-in" ? "New to FairMatch?" : "Already registered?"} <button onClick={() => onSwitch(mode === "sign-in" ? "register" : "sign-in")}>{mode === "sign-in" ? "Create an account" : "Sign in"}</button></p>
  </section></div>;
}
