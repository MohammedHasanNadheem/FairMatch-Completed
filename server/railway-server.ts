/**
 * Railway production API host.
 *
 * Vercel hosts the React application. Railway runs this one Node process so
 * the full FairMatch API can use managed MySQL without the Vercel Hobby
 * serverless-function limit.
 */
import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// `npm exec --workspace` starts this process from apps/api on Railway. Locate
// the repository root from the current directory in either local or Railway use.
const root = [process.cwd(), resolve(process.cwd(), "../..")].find((candidate) =>
  existsSync(resolve(candidate, "api", "health.ts")),
) ?? process.cwd();
const apiModules: Record<string, string> = {
  "/api/health": "api/health.ts",
  "/api/readiness": "api/readiness.ts",
  "/api/v1/auth/register": "api/v1/auth/register.ts",
  "/api/v1/auth/login": "api/v1/auth/login.ts",
  "/api/v1/auth/portal-login": "api/v1/auth/portal-login.ts",
  "/api/v1/auth/refresh": "api/v1/auth/refresh.ts",
  "/api/v1/auth/logout": "api/v1/auth/logout.ts",
  "/api/v1/me": "api/v1/me.ts",
  "/api/v1/profile": "api/v1/profile.ts",
  "/api/v1/evidence": "api/v1/evidence/index.ts",
  "/api/v1/applications": "api/v1/applications/index.ts",
  "/api/v1/opportunities": "api/v1/opportunities/index.ts",
  "/api/v1/organisation/workspace": "api/v1/organisation/workspace.ts",
  "/api/v1/organisation/opportunities": "api/v1/organisation/opportunities.ts",
  "/api/v1/organisation/applications": "api/v1/organisation/applications.ts",
  "/api/v1/organisation/college": "api/v1/organisation/college.ts",
  "/api/v1/admin/access-requests": "api/v1/admin/access-requests.ts",
  "/api/v1/admin/audit": "api/v1/admin/audit.ts",
  "/api/v1/notifications": "api/v1/notifications.ts",
  "/api/v1/account/privacy": "api/v1/account/privacy.ts",
  "/api/v1/account/password": "api/v1/account/password.ts",
  "/api/v1/insights": "api/v1/insights.ts",
  "/api/v1/ai/guide": "api/v1/ai/guide.ts",
  "/api/v1/ats/readiness": "api/v1/ats/readiness.ts",
};

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const baseUrl = `https://${request.headers.host ?? "fairmatch-api.railway.app"}`;
  const pathname = new URL(request.url ?? "/", baseUrl).pathname;
  const modulePath = apiModules[pathname];
  if (!modulePath) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "API route not found." }));
    return;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const body = ["GET", "HEAD"].includes(request.method ?? "GET") ? undefined : await readBody(request);
  const resolved = resolve(root, modulePath);
  const moduleUrl = pathToFileURL(resolved);
  moduleUrl.searchParams.set("v", String(statSync(resolved).mtimeMs));
  const handler = await import(moduleUrl.href) as { default: { fetch: (input: Request) => Promise<Response> } };
  const apiResponse = await handler.default.fetch(new Request(`${baseUrl}${request.url ?? pathname}`, {
    method: request.method,
    headers,
    body,
  }));
  apiResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.statusCode = apiResponse.status;
  response.end(Buffer.from(await apiResponse.arrayBuffer()));
}

const port = Number(process.env.PORT ?? 8080);
createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error("FairMatch Railway API error", error instanceof Error ? error.message : error);
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "The service could not complete this request." }));
  });
}).listen(port, "0.0.0.0", () => console.log(`FairMatch API listening on ${port}`));
