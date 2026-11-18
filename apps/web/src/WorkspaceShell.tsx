import { ReactNode } from "react";
import { NotificationCenter } from "./NotificationCenter";

export type WorkspaceRole =
  | "school_student"
  | "college_student"
  | "job_seeker"
  | "college_coordinator"
  | "college_admin"
  | "company_hr"
  | "company_admin"
  | "platform_admin";
export type WorkspaceView =
  | "overview"
  | "discover"
  | "applications"
  | "insights"
  | "assistant"
  | "profile"
  | "account"
  | "operations"
  | "audit";

const candidateRoles = new Set<WorkspaceRole>([
  "school_student",
  "college_student",
  "job_seeker",
]);
const companyRoles = new Set<WorkspaceRole>(["company_hr", "company_admin"]);
const labels: Record<WorkspaceRole, string> = {
  school_student: "Career explorer",
  college_student: "Student portal",
  job_seeker: "Career workspace",
  college_coordinator: "Placement operations",
  college_admin: "College administration",
  company_hr: "Hiring workspace",
  company_admin: "Company administration",
  platform_admin: "Platform administration",
};

export const adminPreviewRoles: WorkspaceRole[] = [
  "school_student",
  "college_student",
  "job_seeker",
  "college_coordinator",
  "college_admin",
  "company_hr",
  "company_admin",
];

export function canAdminPreviewRole(
  authenticatedRole: WorkspaceRole,
  previewRole: WorkspaceRole | null,
) {
  return (
    authenticatedRole === "platform_admin" &&
    previewRole !== null &&
    adminPreviewRoles.includes(previewRole)
  );
}

export function workspaceItemsFor(
  role: WorkspaceRole,
): Array<{ id: WorkspaceView; label: string; symbol: string }> {
  if (candidateRoles.has(role))
    return [
      { id: "overview", label: "Home", symbol: "◈" },
      { id: "discover", label: "Discover roles", symbol: "⌕" },
      { id: "applications", label: "Applications", symbol: "↗" },
      { id: "insights", label: "My progress", symbol: "▥" },
      { id: "assistant", label: "AI career guide", symbol: "✦" },
      { id: "profile", label: "My profile", symbol: "○" },
      { id: "account", label: "Account & privacy", symbol: "◎" },
    ];
  if (companyRoles.has(role))
    return [
      { id: "overview", label: "Overview", symbol: "◈" },
      { id: "discover", label: "Opportunities", symbol: "⌕" },
      { id: "applications", label: "Candidate review", symbol: "↗" },
      { id: "insights", label: "Hiring intelligence", symbol: "▥" },
      { id: "assistant", label: "AI hiring copilot", symbol: "✦" },
      { id: "profile", label: "Organisation", symbol: "○" },
      { id: "account", label: "Account & privacy", symbol: "◎" },
    ];
  if (role === "platform_admin")
    return [
      { id: "overview", label: "Control centre", symbol: "◈" },
      { id: "operations", label: "Access & organisations", symbol: "⌘" },
      { id: "insights", label: "Platform intelligence", symbol: "▥" },
      { id: "assistant", label: "AI operations", symbol: "✦" },
      { id: "audit", label: "Audit activity", symbol: "≡" },
      { id: "account", label: "Account & privacy", symbol: "◎" },
    ];
  return [
    { id: "overview", label: "Overview", symbol: "◈" },
    { id: "discover", label: "Cohorts", symbol: "⌕" },
    { id: "applications", label: "Placement activity", symbol: "↗" },
    { id: "insights", label: "Placement intelligence", symbol: "▥" },
    { id: "assistant", label: "AI placement insights", symbol: "✦" },
    { id: "profile", label: "Organisation", symbol: "○" },
    { id: "account", label: "Account & privacy", symbol: "◎" },
  ];
}

export function WorkspaceShell({
  role,
  authenticatedRole = role,
  email,
  activeView,
  onNavigate,
  onPreviewRoleChange,
  onSignOut,
  children,
}: {
  role: WorkspaceRole;
  authenticatedRole?: WorkspaceRole;
  email: string;
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onPreviewRoleChange?: (role: WorkspaceRole | null) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const items = workspaceItemsFor(role);
  const previewing = canAdminPreviewRole(authenticatedRole, role);
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <a className="brand workspace-brand" href="#top">
          fair<span>match</span>
        </a>
        <p className="workspace-role">{labels[role]}</p>
        {authenticatedRole === "platform_admin" && onPreviewRoleChange && (
          <label className="admin-preview-select">
            <span>OWNER VIEW</span>
            <select
              value={previewing ? role : "platform_admin"}
              onChange={(event) =>
                onPreviewRoleChange?.(
                  event.target.value === "platform_admin"
                    ? null
                    : (event.target.value as WorkspaceRole),
                )
              }
            >
              <option value="platform_admin">Platform administration</option>
              {adminPreviewRoles.map((previewRole) => (
                <option value={previewRole} key={previewRole}>
                  {labels[previewRole]}
                </option>
              ))}
            </select>
            <small>Role previews are read-only.</small>
          </label>
        )}
        <nav aria-label="Workspace navigation">
          {items.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "active" : ""}
              onClick={() => onNavigate(item.id)}
            >
              <span>{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="workspace-account">
          <span>{email.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{email}</strong>
            <small>
              {previewing
                ? `admin preview · ${role.replace(/_/g, " ")}`
                : authenticatedRole.replace(/_/g, " ")}
            </small>
          </div>
        </div>
        <button className="sidebar-signout" onClick={onSignOut}>
          Sign out
        </button>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="small-label">
              FAIRMATCH / {labels[role].toUpperCase()}
            </p>
            <strong>
              {items.find((item) => item.id === activeView)?.label ??
                "Workspace"}
            </strong>
          </div>
          <NotificationCenter />
        </header>
        {previewing && (
          <div className="admin-preview-banner">
            <strong>Read-only owner preview</strong>
            <span>
              You are viewing the {labels[role]} experience. No candidate,
              college or company records can be changed from preview mode.
            </span>
            <button onClick={() => onPreviewRoleChange?.(null)}>
              Return to administration
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
