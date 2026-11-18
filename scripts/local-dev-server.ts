/**
 * Local FairMatch review server.
 *
 * It serves the Vite React client and invokes the same Request/Response API
 * handlers deployed to Vercel. Secrets remain in .env.local and are never
 * exposed to the browser bundle.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), override: true });

const root = process.cwd();
const webRoot = resolve(root, "apps/web");
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

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string) {
  const modulePath = apiModules[pathname];
  if (!modulePath) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "API route not found." }));
    return;
  }
  const body = ["GET", "HEAD"].includes(request.method ?? "GET") ? undefined : await requestBody(request);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  const origin = `http://${request.headers.host ?? "127.0.0.1:3000"}`;
  const apiRequest = new Request(`${origin}${request.url ?? pathname}`, { method: request.method, headers, body });
  // Node caches dynamic imports by URL. Add the handler's modification time so
  // local review reflects API edits without requiring a server restart.
  const resolvedModulePath = resolve(root, modulePath);
  const moduleUrl = pathToFileURL(resolvedModulePath);
  moduleUrl.searchParams.set("v", String(statSync(resolvedModulePath).mtimeMs));
  const module = await import(moduleUrl.href);
  const apiResponse: Response = await module.default.fetch(apiRequest);
  apiResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.statusCode = apiResponse.status;
  response.end(Buffer.from(await apiResponse.arrayBuffer()));
}

async function main() {
  const vite = await createViteServer({ root: webRoot, appType: "spa", server: { middlewareMode: true } });
  const port = Number(process.env.LOCAL_PORT ?? 3000);
  const host = process.env.LOCAL_HOST ?? "127.0.0.1";
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`).pathname;
    try {
      if (pathname.startsWith("/api/")) await handleApi(request, response, pathname);
      else vite.middlewares(request, response, (error) => {
        if (error) { vite.ssrFixStacktrace(error as Error); response.statusCode = 500; response.end("Local FairMatch server error."); }
      });
    } catch (error) {
      console.error("Local FairMatch API error", error instanceof Error ? error.message : error);
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "The service could not complete this request." }));
    }
  });
  server.listen(port, host, () => console.log(`FairMatch local review server: http://${host}:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
}

main().catch((error) => { console.error("FairMatch local server could not start", error); process.exit(1); });
