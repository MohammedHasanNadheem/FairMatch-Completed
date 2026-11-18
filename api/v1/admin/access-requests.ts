import { z } from "zod";
import { requireUser } from "../../../server/auth-service";
import { pendingAccessRequests, resolveAccessRequest } from "../../../server/admin-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";

const schema = z.object({ userId: z.string().uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).optional() });
export default { async fetch(request: Request) {
  if (request.method === "OPTIONS") return options(request);
  try { const token = bearerToken(request); if (!token) return response(request, { error: "Sign in again to continue." }, 401); const actor = await requireUser(token); if (request.method === "GET") return response(request, { items: await pendingAccessRequests(actor) }); if (request.method === "PATCH") return response(request, await resolveAccessRequest(actor, await readJson(request, schema))); return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, PATCH, OPTIONS" }); }
  catch (error) { return errorResponse(request, error); }
} };
