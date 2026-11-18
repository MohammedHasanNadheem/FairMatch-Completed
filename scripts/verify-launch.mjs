import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  const path = resolve(".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] == null)
      process.env[match[1]] = match[2];
  }
}

loadLocalEnv();

const productionUrl = (
  process.env.FAIRMATCH_PRODUCTION_URL ??
  "https://fairmatch-platform.vercel.app"
).replace(/\/$/, "");
const supabaseUrl = (
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";
const results = [];
const record = (name, passed, detail) => results.push({ name, passed, detail });

async function checkProduction() {
  const startedAt = performance.now();
  const root = await fetch(`${productionUrl}/`, { redirect: "follow" });
  const rootLatencyMs = Math.round(performance.now() - startedAt);
  record("Production root", root.ok, `HTTP ${root.status}`);
  record(
    "Production root latency",
    rootLatencyMs < 2000,
    `${rootLatencyMs} ms (budget < 2000 ms)`,
  );
  record(
    "Production content type",
    (root.headers.get("content-type") ?? "").includes("text/html"),
    root.headers.get("content-type") ?? "missing",
  );
  const requiredHeaders = {
    "content-security-policy": "frame-ancestors 'none'",
    "strict-transport-security": "max-age=",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin",
    "permissions-policy": "camera=()",
    "cross-origin-opener-policy": "same-origin",
  };
  for (const [header, expected] of Object.entries(requiredHeaders)) {
    const value = root.headers.get(header) ?? "";
    record(
      `Security header: ${header}`,
      value.includes(expected),
      value ? "present" : "missing",
    );
  }

  const rootHtml = await root.text();
  const entryAsset = rootHtml.match(/<script[^>]+src="([^"]+\.js)"/i)?.[1];
  if (!entryAsset) {
    record("Production entry asset", false, "script asset not found");
  } else {
    const assetUrl = new URL(entryAsset, `${productionUrl}/`);
    const asset = await fetch(assetUrl);
    const assetBytes = Number(asset.headers.get("content-length")) ||
      (await asset.arrayBuffer()).byteLength;
    record(
      "Production entry asset",
      asset.ok,
      `HTTP ${asset.status}`,
    );
    record(
      "Entry asset transfer budget",
      assetBytes < 600_000,
      `${Math.round(assetBytes / 1024)} KiB (budget < 586 KiB)`,
    );
    const cacheControl = asset.headers.get("cache-control") ?? "";
    const maxAge = Number(cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1] ?? 0);
    record(
      "Versioned asset caching",
      maxAge >= 31_536_000 && /(?:^|,)\s*immutable(?:,|$)/i.test(cacheControl),
      cacheControl || "missing",
    );
  }

  const health = await fetch(`${productionUrl}/api/health`, {
    cache: "no-store",
  });
  const healthBody = await health.json().catch(() => ({}));
  record(
    "Liveness endpoint",
    health.ok && healthBody.status === "ok",
    `HTTP ${health.status}`,
  );

  const readiness = await fetch(`${productionUrl}/api/readiness`, {
    cache: "no-store",
  });
  const readinessBody = await readiness.json().catch(() => ({}));
  record(
    "Dependency readiness",
    readiness.ok &&
      readinessBody.status === "ready" &&
      readinessBody.checks?.databaseAuth === true &&
      readinessBody.checks?.aiConfigured === true,
    `HTTP ${readiness.status}`,
  );

  const anonymousAssistant = await fetch(`${productionUrl}/api/assistant`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Explain a career pathway",
      contextType: "career_guidance",
      history: [],
    }),
  });
  record(
    "Anonymous AI access rejected",
    anonymousAssistant.status === 401,
    `HTTP ${anonymousAssistant.status}`,
  );

  const anonymousCheckout = await fetch(`${productionUrl}/api/billing/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  record(
    "Anonymous billing access rejected",
    anonymousCheckout.status === 401,
    `HTTP ${anonymousCheckout.status}`,
  );

  const billingStatus = await fetch(`${productionUrl}/api/billing/status`, { cache: "no-store" });
  const billingStatusBody = await billingStatus.json().catch(() => ({}));
  record(
    "Billing capability endpoint",
    billingStatus.ok && typeof billingStatusBody.configured === "boolean",
    `HTTP ${billingStatus.status}`,
  );
}

async function anonymousCollectionIsPrivate(path, headers, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  if ([401, 403].includes(response.status)) return { passed: true, response, count: 0 };
  const body = await response.json().catch(() => null);
  return {
    passed: response.ok && Array.isArray(body) && body.length === 0,
    response,
    count: Array.isArray(body) ? body.length : null,
  };
}

async function checkMigrations() {
  if (!supabaseUrl || !supabaseKey) {
    record(
      "Supabase migration verification",
      false,
      "public URL or publishable key missing",
    );
    return;
  }
  const headers = {
    apikey: supabaseKey,
    authorization: `Bearer ${supabaseKey}`,
  };
  for (const [migration, table] of [
    ["013", "candidate_documents"],
    ["014", "skill_assessments"],
    ["015", "saved_searches"],
    ["016", "saas_plans"],
    ["018", "ai_access_plans"],
    ["018", "profile_ai_subscriptions"],
  ]) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,
      { headers },
    );
    record(
      `Migration ${migration}: ${table}`,
      response.status !== 404,
      `HTTP ${response.status}`,
    );
  }
  const privacyResponse = await fetch(
    `${supabaseUrl}/rest/v1/privacy_requests?select=id&limit=1`,
    { headers },
  );
  record(
    "Migration 017: privacy_requests",
    privacyResponse.status !== 404,
    `HTTP ${privacyResponse.status}`,
  );

  for (const table of [
    "profiles",
    "candidate_applications",
    "candidate_documents",
    "assessment_attempts",
    "candidate_skill_evidence",
    "privacy_requests",
    "audit_events",
  ]) {
    const probe = await anonymousCollectionIsPrivate(
      `/rest/v1/${table}?select=*&limit=1`,
      headers,
    );
    record(
      `Anonymous isolation: ${table}`,
      probe.passed,
      `HTTP ${probe.response.status}${probe.count == null ? "" : `, ${probe.count} rows`}`,
    );
  }

  const storageProbe = await anonymousCollectionIsPrivate(
    "/storage/v1/object/list/candidate-documents",
    headers,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1, offset: 0 }),
    },
  );
  record(
    "Anonymous isolation: candidate document storage",
    storageProbe.passed,
    `HTTP ${storageProbe.response.status}${storageProbe.count == null ? "" : `, ${storageProbe.count} objects`}`,
  );
}

try {
  await checkProduction();
  await checkMigrations();
} catch (error) {
  record(
    "Verifier execution",
    false,
    error instanceof Error ? error.message : "unknown error",
  );
}

for (const result of results)
  console.log(
    `${result.passed ? "PASS" : "FAIL"}  ${result.name} (${result.detail})`,
  );
const failed = results.filter((result) => !result.passed);
console.log(
  `\n${results.length - failed.length}/${results.length} automated launch checks passed.`,
);
if (failed.length) {
  console.error(
    "Launch verification failed. FairMatch must not be publicly approved yet.",
  );
  process.exitCode = 1;
}
