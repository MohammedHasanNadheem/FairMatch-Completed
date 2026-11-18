export type ApiRole =
  | "school_student"
  | "college_student"
  | "job_seeker"
  | "college_coordinator"
  | "college_admin"
  | "company_hr"
  | "company_admin"
  | "platform_admin";

export type ApiUser = {
  id: string;
  email: string;
  role: ApiRole;
  accountStatus: string;
  emailVerified: boolean;
};

type AuthPayload = { accessToken: string; refreshToken?: string; user: ApiUser };
type RegistrationPayload = { email: string; role: ApiRole; accountStatus: string; verificationRequired: boolean; message?: string };
export type ApiOpportunity = { id: string; title: string; type: "internship" | "placement" | "job"; location: string | null; workMode: "onsite" | "hybrid" | "remote"; description: string; requirements: unknown; organisationName: string; publishedAt: string };
export type ApiApplication = { id: string; status: string; submittedAt: string; updatedAt: string; coverNote: string | null; opportunity: Pick<ApiOpportunity, "id" | "title" | "type" | "location" | "workMode" | "organisationName"> };
export type CandidateProfile = {
  fullName: string;
  headline: string;
  location: string;
  stage: "school" | "college" | "experienced";
  skills: string[];
  preferences: { targetRoles?: string[]; preferredLocations?: string[]; workModes?: string[]; opportunityTypes?: string[] };
  visibility: "private" | "application_only" | "discoverable";
  updatedAt: string | null;
};
export type CollegeCohort = { id: string; name: string; department: string | null; graduationYear: number; eligibilityNotes: string | null; status: "active" | "archived"; createdAt: string };
export type PlacementDrive = { id: string; cohortId: string | null; cohortName: string | null; title: string; employerName: string; driveDate: string | null; status: "planned" | "open" | "completed" | "cancelled"; notes: string | null; createdAt: string };
export type OrganisationWorkspace = {
  approval: "pending" | "active";
  organisation: { id: string; name: string; kind: "college" | "company"; verificationStatus: string; membershipStatus: string } | null;
  opportunities: Array<{ id: string; title: string; type: "internship" | "placement" | "job"; location: string | null; workMode: string; status: "draft" | "published" | "closed"; createdAt: string; applications: number }>;
  applications: Array<{ id: string; status: string; submittedAt: string; candidate: { name: string; email: string }; opportunityTitle: string; coverNote: string | null }>;
  cohorts?: CollegeCohort[];
  drives?: PlacementDrive[];
};

let accessToken: string | null = null;

function storeSession(payload: AuthPayload) {
  accessToken = payload.accessToken;
  return payload.user;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const reply = await fetch(path, { ...init, headers, credentials: "include" });
  const body = await reply.json().catch(() => ({})) as T & { error?: string };
  if (!reply.ok) throw new Error(body.error ?? "FairMatch could not complete this request.");
  return body;
}

export async function registerAccount(input: { fullName: string; email: string; password: string; requestedRole: Exclude<ApiRole, "platform_admin">; organisationName?: string }) {
  return request<RegistrationPayload>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export async function loginAccount(email: string, password: string) {
  const payload = await request<AuthPayload>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return storeSession(payload);
}

export async function loginPortal(role: ApiRole) {
  const payload = await request<AuthPayload>("/api/v1/auth/portal-login", { method: "POST", body: JSON.stringify({ role }) });
  return storeSession(payload);
}

export async function restoreSession() {
  try {
    const payload = await request<AuthPayload>("/api/v1/auth/refresh", { method: "POST", body: "{}" });
    return storeSession(payload);
  } catch {
    clearSession();
    return null;
  }
}

export async function currentUser() {
  if (!accessToken) return restoreSession();
  try { return (await request<{ user: ApiUser }>("/api/v1/me")).user; }
  catch { return restoreSession(); }
}

export async function signOutAccount() {
  await request("/api/v1/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
  clearSession();
}

export async function listOpportunities(filters: { query?: string; type?: string; workMode?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.query) query.set("q", filters.query);
  if (filters.type && filters.type !== "all") query.set("type", filters.type);
  if (filters.workMode && filters.workMode !== "all") query.set("workMode", filters.workMode);
  const suffix = query.size ? `?${query}` : "";
  return request<{ items: ApiOpportunity[]; total: number }>(`/api/v1/opportunities${suffix}`);
}

export async function submitApplication(opportunityId: string, coverNote?: string) {
  return request<{ id: string; status: string; submittedAt: string }>("/api/v1/applications", { method: "POST", body: JSON.stringify({ opportunityId, coverNote }) });
}

export async function listApplications() {
  return request<{ items: ApiApplication[] }>("/api/v1/applications");
}

export async function updateApplication(applicationId: string, action: "withdraw" | "accept_offer" | "decline_offer", note?: string) {
  return request<{ id: string; status: string; offerDecision?: string }>("/api/v1/applications", {
    method: "PATCH",
    body: JSON.stringify({ applicationId, action, note }),
  });
}

export async function getCandidateProfile() {
  return (await request<{ profile: CandidateProfile }>("/api/v1/profile")).profile;
}

export async function saveCandidateProfile(profile: Partial<Omit<CandidateProfile, "fullName" | "stage" | "updatedAt">>) {
  return (await request<{ profile: CandidateProfile }>("/api/v1/profile", { method: "PATCH", body: JSON.stringify(profile) })).profile;
}

export type CandidateEvidence = { id: string; kind: "resume" | "portfolio" | "certificate" | "employment" | "achievement" | "offer_letter" | "project" | "other"; title: string; issuer: string; issuedOn: string | null; expiresOn: string | null; verificationUrl: string; portfolioUrl: string; skills: string[]; notes: string; fileName: string; fileType: string; fileSizeBytes: number; verificationStatus: "self_attested" | "pending" | "verified" | "rejected"; createdAt: string };
export type EvidenceInput = { kind: CandidateEvidence["kind"]; title: string; issuer?: string; issuedOn?: string; expiresOn?: string; verificationUrl?: string; portfolioUrl?: string; skills?: string[]; notes?: string; file?: { name: string; type: "application/pdf" | "image/png" | "image/jpeg"; base64: string } };
export async function listEvidence() { return (await request<{ items: CandidateEvidence[] }>("/api/v1/evidence")).items; }
export async function createEvidence(input: EvidenceInput) { return (await request<{ item: CandidateEvidence }>("/api/v1/evidence", { method: "POST", body: JSON.stringify({ action: "create", ...input }) })).item; }
export async function applyEvidenceSkills(evidenceId: string) { return (await request<{ skills: string[] }>("/api/v1/evidence", { method: "POST", body: JSON.stringify({ action: "apply_skills", evidenceId }) })).skills; }
export async function deleteEvidence(evidenceId: string) { await request("/api/v1/evidence", { method: "POST", body: JSON.stringify({ action: "delete", evidenceId }) }); }

export async function getOrganisationWorkspace() {
  return request<OrganisationWorkspace>("/api/v1/organisation/workspace");
}

export async function createOrganisationOpportunity(input: { title: string; type: "internship" | "placement" | "job"; location?: string; workMode: "onsite" | "hybrid" | "remote"; description: string; requirements?: string[] }) {
  return request<{ id: string; status: string }>("/api/v1/organisation/opportunities", { method: "POST", body: JSON.stringify({ action: "create", ...input }) });
}

export async function publishOrganisationOpportunity(opportunityId: string) {
  return request<{ id: string; status: string }>("/api/v1/organisation/opportunities", { method: "POST", body: JSON.stringify({ action: "publish", opportunityId }) });
}

export async function closeOrganisationOpportunity(opportunityId: string) {
  return request<{ id: string; status: string }>("/api/v1/organisation/opportunities", { method: "POST", body: JSON.stringify({ action: "close", opportunityId }) });
}

export async function reviewOrganisationApplication(applicationId: string, status: "shortlisted" | "interview" | "offer" | "rejected", note?: string) {
  return request<{ id: string; status: string }>("/api/v1/organisation/applications", { method: "PATCH", body: JSON.stringify({ applicationId, status, note }) });
}

export async function createCollegeCohort(input: { name: string; department?: string; graduationYear: number; eligibilityNotes?: string }) {
  return request<{ id: string; status: string }>("/api/v1/organisation/college", { method: "POST", body: JSON.stringify({ action: "create_cohort", ...input }) });
}

export async function createPlacementDrive(input: { cohortId?: string; title: string; employerName: string; driveDate?: string; notes?: string }) {
  return request<{ id: string; status: string }>("/api/v1/organisation/college", { method: "POST", body: JSON.stringify({ action: "create_drive", ...input }) });
}

export async function updatePlacementDriveStatus(driveId: string, status: "planned" | "open" | "completed" | "cancelled") {
  return request<{ id: string; status: string }>("/api/v1/organisation/college", { method: "POST", body: JSON.stringify({ action: "update_drive_status", driveId, status }) });
}

export type AccessRequest = { userId: string; name: string; email: string; role: string; requestedOrganisationName: string; organisationId: string; organisationName: string; kind: "college" | "company"; requestedAt: string };
export async function listAccessRequests() { return (await request<{ items: AccessRequest[] }>("/api/v1/admin/access-requests")).items; }
export async function resolveAccessRequest(userId: string, decision: "approve" | "reject", note?: string) { return request<{ userId: string; decision: string }>("/api/v1/admin/access-requests", { method: "PATCH", body: JSON.stringify({ userId, decision, note }) }); }

export type AuditEventItem = { id: string; actorEmail: string | null; actorName: string | null; organisationName: string | null; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> | null; createdAt: string };
export async function listAuditEvents() { return (await request<{ items: AuditEventItem[] }>("/api/v1/admin/audit")).items; }

export type NotificationItem = { id: string; title: string; body: string; category: "application" | "approval" | "organisation" | "system"; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string };
export async function listNotifications() { return request<{ items: NotificationItem[]; unreadCount: number }>("/api/v1/notifications"); }
export async function markNotificationsRead(notificationId?: string) { return request<{ items: NotificationItem[]; unreadCount: number }>("/api/v1/notifications", { method: "PATCH", body: JSON.stringify({ notificationId }) }); }

export type PrivacyRequestItem = { id: string; requestType: "export" | "deletion"; status: "pending" | "in_review" | "completed" | "cancelled"; notes: string | null; createdAt: string; updatedAt: string };
export async function listPrivacyRequests() { return (await request<{ items: PrivacyRequestItem[] }>("/api/v1/account/privacy")).items; }
export async function createPrivacyRequest(requestType: "export" | "deletion", notes?: string) { return request<PrivacyRequestItem>("/api/v1/account/privacy", { method: "POST", body: JSON.stringify({ requestType, notes }) }); }
export async function exportAccountData() { return request<Record<string, unknown>>("/api/v1/account/privacy?export=1"); }
export async function changeAccountPassword(currentPassword: string, newPassword: string) { return request<{ updated: boolean }>("/api/v1/account/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); }

export type RoleInsightsResponse = {
  readiness: number;
  evidenceCount?: number;
  openOpportunities?: number;
  applications: number;
  shortlisted?: number;
  interviews: number;
  offers: number;
  metrics: Array<{ label: string; value: number; unit?: string; detail: string; tone: "lime" | "clay" | "plum" | "sage" }>;
  funnel: Array<{ label: string; value: number }>;
};
export async function getRoleInsights() { return request<RoleInsightsResponse>("/api/v1/insights"); }

export type GuidedAnswer = { provider?: "gemini" | "fallback"; answer: string; whyShown: string[]; strengths: string[]; gaps: string[]; confidence: "low" | "medium" | "high"; limitations: string; nextActions: string[]; followUpPrompts: string[]; humanReviewRecommended: boolean };
export async function requestGuidedAdvice(message: string, context: "career_guidance" | "opportunity_match" | "application_support" | "cohort_insight" | "recruiting_support" | "platform_operations") {
  return (await request<{ answer: GuidedAnswer }>("/api/v1/ai/guide", { method: "POST", body: JSON.stringify({ message, context }) })).answer;
}

export type AtsReadiness = { score: number; confidence: "low" | "medium" | "high"; targetRole: string | null; matchedSkills: string[]; missingSkills: string[]; criteria: Array<{ label: string; points: number; maximum: number; explanation: string }>; recommendations: string[]; disclaimer: string };
export async function requestAtsReadiness(targetRole: string, requirements: string[]) {
  return (await request<{ readiness: AtsReadiness }>("/api/v1/ats/readiness", { method: "POST", body: JSON.stringify({ targetRole: targetRole.trim() || undefined, requirements }) })).readiness;
}

export function clearSession() {
  accessToken = null;
}
