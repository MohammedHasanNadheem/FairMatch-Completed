import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AuthDialog, type AuthMode } from "./AuthDialog";
import { currentUser, loginPortal, signOutAccount } from "./lib/api";
import {
  WorkspaceShell,
  type WorkspaceRole,
  type WorkspaceView,
} from "./WorkspaceShell";
import { AppErrorBoundary } from "./AppErrorBoundary";

const AdminConsole = lazy(() =>
  import("./AdminConsole").then((module) => ({ default: module.AdminConsole })),
);
const OpportunityMarketplace = lazy(() =>
  import("./OpportunityMarketplace").then((module) => ({
    default: module.OpportunityMarketplace,
  })),
);
const Dashboard = lazy(() =>
  import("./Dashboard").then((module) => ({ default: module.Dashboard })),
);
const CandidateWorkspace = lazy(() =>
  import("./CandidateWorkspace").then((module) => ({
    default: module.CandidateWorkspace,
  })),
);
const CandidateApplications = lazy(() =>
  import("./CandidateApplications").then((module) => ({
    default: module.CandidateApplications,
  })),
);
const CandidateProfilePage = lazy(() =>
  import("./CandidateProfilePage").then((module) => ({
    default: module.CandidateProfilePage,
  })),
);
const OrganisationWorkspace = lazy(() =>
  import("./OrganisationWorkspace").then((module) => ({
    default: module.OrganisationWorkspace,
  })),
);
const AiCareerAssistant = lazy(() =>
  import("./AiCareerAssistant").then((module) => ({
    default: module.AiCareerAssistant,
  })),
);
const RoleInsights = lazy(() =>
  import("./RoleInsights").then((module) => ({ default: module.RoleInsights })),
);
const AccountSettings = lazy(() =>
  import("./AccountSettings").then((module) => ({
    default: module.AccountSettings,
  })),
);

function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<WorkspaceRole | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [authNotice, setAuthNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!authNotice) return;
    const timer = setTimeout(() => setAuthNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [authNotice]);

  useEffect(() => {
    let active = true;
    currentUser().then((user) => {
      if (!active || !user) return;
      setAccountEmail(user.email);
      setAccountRole(user.role as WorkspaceRole);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function signOut() {
    await signOutAccount();
    setAccountEmail(null);
    setAccountRole(null);
    setActiveView("overview");
  }

  async function switchPortal(nextRole: WorkspaceRole | null) {
    const target = nextRole ?? "platform_admin";
    try {
      const user = await loginPortal(target);
      setAccountEmail(user.email);
      setAccountRole(user.role as WorkspaceRole);
      setActiveView("overview");
    } catch (error) {
      setAuthNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not switch portal.",
      });
    }
  }

  function navigate(view: WorkspaceView) {
    setActiveView(view);
  }

  return (
    <main className="app-shell">
      {authNotice && (
        <div
          className={`auth-callback-notice ${authNotice.tone}`}
          role="status"
        >
          <span>{authNotice.message}</span>
          <button
            onClick={() => setAuthNotice(null)}
            aria-label="Dismiss authentication message"
          >
            ×
          </button>
        </div>
      )}
      {!accountEmail && (
        <nav className="topbar">
          <a className="brand" href="#top">
            fair<span>match</span>
          </a>
          <div className="nav-meta">
            <button className="sign-in" onClick={() => setAuthMode("sign-in")}>
              Sign in
            </button>
          </div>
        </nav>
      )}
      {!accountEmail && (
        <>
          <section className="hero minimal-hero" id="top">
            <div>
              <p className="eyebrow">FAIRMATCH CAREER NETWORK</p>
              <h1>
                Make the next
                <br />
                <em>right move.</em>
              </h1>
              <p className="copy">
                Career discovery, internships, placements and hiring—connected
                in one trusted workspace.
              </p>
              <div className="hero-actions">
                <button onClick={() => setAuthMode("register")}>
                  Create account
                </button>
                <button
                  className="quiet-action"
                  onClick={() => setAuthMode("sign-in")}
                >
                  Sign in to a portal
                </button>
              </div>
            </div>
            <aside className="access-card">
              <p className="small-label">ONE CONNECTED WORKFLOW</p>
              <ol>
                <li>
                  <span>01</span> Choose your portal
                </li>
                <li>
                  <span>02</span> Build your verified profile
                </li>
                <li>
                  <span>03</span> Move forward with clear reasons
                </li>
              </ol>
            </aside>
          </section>
          <section className="role-strip">
            <p>
              For school students, college students, job seekers, colleges and
              companies.
            </p>
            <span>
              Private by default · Human decisions · Clear audit trail
            </span>
          </section>
        </>
      )}
      {accountEmail && !accountRole && (
        <p className="account-loading">Setting up your secure workspace…</p>
      )}
      {accountEmail && accountRole && (
        <WorkspaceShell
          role={accountRole}
          authenticatedRole={accountRole}
          email={accountEmail}
          activeView={activeView}
          onNavigate={navigate}
          onPreviewRoleChange={switchPortal}
          onSignOut={signOut}
        >
          <Suspense
            fallback={
              <p className="account-loading">Loading your secure workspace…</p>
            }
          >
            {activeView === "account" ? (
              <AccountSettings role={accountRole} email={accountEmail} />
            ) : activeView === "insights" ? (
              <RoleInsights role={accountRole} />
            ) : activeView === "assistant" ? (
              <AiCareerAssistant role={accountRole} />
            ) : activeView === "discover" &&
              ["school_student", "college_student", "job_seeker"].includes(
                accountRole,
              ) ? (
              <OpportunityMarketplace
                signedIn
                onSignIn={() => setAuthMode("sign-in")}
                role={
                  accountRole as
                    "school_student" | "college_student" | "job_seeker"
                }
              />
            ) : activeView === "applications" &&
              ["school_student", "college_student", "job_seeker"].includes(
                accountRole,
              ) ? (
              <CandidateApplications
                role={
                  accountRole as
                    "school_student" | "college_student" | "job_seeker"
                }
                onBrowse={() => setActiveView("discover")}
              />
            ) : activeView === "profile" &&
              ["school_student", "college_student", "job_seeker"].includes(
                accountRole,
              ) ? (
              <CandidateProfilePage
                role={
                  accountRole as
                    "school_student" | "college_student" | "job_seeker"
                }
              />
            ) : accountRole === "platform_admin" &&
              (activeView === "operations" || activeView === "audit") ? (
              <AdminConsole
                initialTab={activeView === "audit" ? "audit" : "overview"}
                onClose={() => setActiveView("overview")}
              />
            ) : ["school_student", "college_student", "job_seeker"].includes(
                accountRole,
              ) ? (
              <CandidateWorkspace
                role={
                  accountRole as
                    "school_student" | "college_student" | "job_seeker"
                }
                onBrowse={() => setActiveView("discover")}
                onEditProfile={() => setActiveView("profile")}
                onApplications={() => setActiveView("applications")}
              />
            ) : [
                "college_coordinator",
                "college_admin",
                "company_hr",
                "company_admin",
              ].includes(accountRole) ? (
              <OrganisationWorkspace
                role={
                  accountRole as
                    | "college_coordinator"
                    | "college_admin"
                    | "company_hr"
                    | "company_admin"
                }
                view={activeView}
              />
            ) : (
              <Dashboard
                role={accountRole}
                onOpenGovernance={() => setActiveView("operations")}
                onBrowse={() => setActiveView("discover")}
                onEditProfile={() => setActiveView("overview")}
              />
            )}
          </Suspense>
        </WorkspaceShell>
      )}
      {authMode && (
        <AuthDialog
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitch={setAuthMode}
          onAuthenticated={(user) => {
            setAccountEmail(user.email);
            setAccountRole(user.role as WorkspaceRole);
            setActiveView("overview");
            setAuthNotice({ tone: "success", message: `Signed in to ${user.role.replace(/_/g, " ")} portal.` });
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
