import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  for (const file of [".env", ".env.local"]) {
    const path = resolve(file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && (process.env[match[1]] == null || process.env[match[1]] === "")) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

loadLocalEnv();

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const roles = [
  "school_student",
  "college_student",
  "job_seeker",
  "college_coordinator",
  "college_admin",
  "company_hr",
  "company_admin",
  "platform_admin",
];
const organisationRoles = new Set(["college_coordinator", "college_admin", "company_hr", "company_admin"]);
const candidateRoles = new Set(["school_student", "college_student", "job_seeker"]);
const results = [];
const record = (role, check, passed, detail) => results.push({ role, check, passed, detail });

function envPrefix(role) {
  return `FAIRMATCH_TEST_${role.toUpperCase()}`;
}

async function request(path, options = {}) {
  return fetch(`${supabaseUrl}${path}`, {
    signal: AbortSignal.timeout(12_000),
    ...options,
  });
}

async function verifyRole(role) {
  const prefix = envPrefix(role);
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    record(role, "credentials", false, `set ${prefix}_EMAIL and ${prefix}_PASSWORD locally`);
    return;
  }

  const tokenResponse = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: supabaseKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token || !tokenBody.user?.id) {
    record(role, "sign in", false, `HTTP ${tokenResponse.status}: ${tokenBody.error_description ?? tokenBody.msg ?? "authentication failed"}`);
    return;
  }
  record(role, "sign in", true, `HTTP ${tokenResponse.status}`);

  const headers = { apikey: supabaseKey, authorization: `Bearer ${tokenBody.access_token}` };
  const profileResponse = await request(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(tokenBody.user.id)}&select=id,role,active`,
    { headers },
  );
  const profiles = await profileResponse.json().catch(() => []);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  record(
    role,
    "assigned profile",
    profileResponse.ok && profile?.role === role && profile?.active === true,
    profile ? `role=${profile.role}, active=${profile.active}` : `HTTP ${profileResponse.status}, profile missing`,
  );

  if (organisationRoles.has(role)) {
    const membershipResponse = await request(
      `/rest/v1/organisation_members?profile_id=eq.${encodeURIComponent(tokenBody.user.id)}&status=eq.active&select=organisation_id,role,status`,
      { headers },
    );
    const memberships = await membershipResponse.json().catch(() => []);
    const matchingMembership = Array.isArray(memberships) && memberships.some((membership) => membership.role === role && membership.status === "active");
    record(
      role,
      "active tenant membership",
      membershipResponse.ok && matchingMembership,
      matchingMembership ? "matching active membership found" : `HTTP ${membershipResponse.status}, matching membership missing`,
    );
  }

  if (candidateRoles.has(role)) {
    const candidateResponse = await request(
      `/rest/v1/career_profiles?profile_id=eq.${encodeURIComponent(tokenBody.user.id)}&select=profile_id,stage&limit=1`,
      { headers },
    );
    record(role, "candidate workspace read", candidateResponse.ok, `HTTP ${candidateResponse.status}`);
  }

  if (role === "platform_admin") {
    const adminResponse = await request("/rest/v1/access_requests?select=id,status&limit=1", { headers });
    record(role, "administration read", adminResponse.ok, `HTTP ${adminResponse.status}`);
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error("Set the Supabase public URL and publishable key before running role verification.");
  process.exit(1);
}

for (const role of roles) {
  try {
    await verifyRole(role);
  } catch (error) {
    record(role, "verifier execution", false, error instanceof Error ? error.message : "unknown error");
  }
}

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.role} · ${result.check} (${result.detail})`);
}
const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} authenticated role checks passed.`);
if (failed.length) {
  console.error("Authenticated role certification is incomplete. Do not approve public launch yet.");
  process.exitCode = 1;
}
