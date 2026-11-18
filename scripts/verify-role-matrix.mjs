import { randomBytes } from "node:crypto";
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
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const baseEmail = process.env.FAIRMATCH_TEST_BASE_EMAIL ?? "";
const runId = Date.now().toString(36);
const roles = [
  ["school_student", "school", null],
  ["college_student", "college", null],
  ["job_seeker", "experienced", null],
  ["college_coordinator", "experienced", "college"],
  ["college_admin", "experienced", "college"],
  ["company_hr", "experienced", "company"],
  ["company_admin", "experienced", "company"],
  ["platform_admin", "experienced", null],
];
const createdUsers = [];
const createdOrganisations = [];

if (!supabaseUrl || !publishableKey || !secretKey || !baseEmail.includes("@")) {
  console.error("Set Supabase URL, publishable key, SUPABASE_SECRET_KEY and FAIRMATCH_TEST_BASE_EMAIL in .env.local.");
  process.exit(1);
}

const adminHeaders = {
  apikey: secretKey,
  "content-type": "application/json",
};

function aliasFor(role) {
  const at = baseEmail.lastIndexOf("@");
  const local = baseEmail.slice(0, at).split("+")[0];
  return `${local}+fairmatch-${role.replaceAll("_", "-")}-${runId}${baseEmail.slice(at)}`;
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    signal: AbortSignal.timeout(15_000),
    ...options,
    headers: { ...adminHeaders, ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed with HTTP ${response.status}: ${body?.message ?? body?.msg ?? "request failed"}`);
  }
  return body;
}

async function createOrganisation(kind) {
  const rows = await adminRequest("/rest/v1/organisations?select=id", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      kind,
      name: `FairMatch Test ${kind === "college" ? "College" : "Company"}`,
      slug: `fairmatch-test-${kind}-${runId}`,
      verified: true,
    }),
  });
  const organisation = Array.isArray(rows) ? rows[0] : null;
  if (!organisation?.id) throw new Error(`Temporary ${kind} organisation was not returned`);
  createdOrganisations.push(organisation.id);
  return organisation.id;
}

const organisationIds = {};

async function provisionRole(role, stage, organisationKind) {
  const email = aliasFor(role);
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `FairMatch ${role.replaceAll("_", " ")} test`,
        candidate_stage: stage,
        requested_role: organisationKind ? role : undefined,
        organisation_name: organisationKind ? `FairMatch Test ${organisationKind}` : undefined,
      },
    }),
  });
  if (!user?.id) throw new Error(`Temporary ${role} user was not returned`);
  createdUsers.push(user.id);

  await adminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ role, active: true }),
  });

  if (organisationKind) {
    const organisationId = organisationIds[organisationKind];
    await adminRequest("/rest/v1/organisation_members", {
      method: "POST",
      headers: { prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify({ organisation_id: organisationId, profile_id: user.id, role, status: "active" }),
    });
  }

  const prefix = `FAIRMATCH_TEST_${role.toUpperCase()}`;
  process.env[`${prefix}_EMAIL`] = email;
  process.env[`${prefix}_PASSWORD`] = password;
}

async function cleanup() {
  const errors = [];
  for (const userId of createdUsers.reverse()) {
    try {
      await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "user cleanup failed");
    }
  }
  for (const organisationId of createdOrganisations.reverse()) {
    try {
      await adminRequest(`/rest/v1/organisations?id=eq.${encodeURIComponent(organisationId)}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "organisation cleanup failed");
    }
  }
  if (errors.length) {
    console.error(`Temporary test-data cleanup failed:\n${errors.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("Temporary role identities and organisations were removed.");
  }
}

try {
  organisationIds.college = await createOrganisation("college");
  organisationIds.company = await createOrganisation("company");
  for (const role of roles) await provisionRole(...role);
  await import(`./verify-roles.mjs?run=${runId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Role matrix provisioning failed");
  process.exitCode = 1;
} finally {
  await cleanup();
}
