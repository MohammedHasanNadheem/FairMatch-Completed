import { z } from "zod";
import { requireUser } from "../../../server/auth-service";
import { reviewOrganisationApplication } from "../../../server/organisation-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";

const schema = z.object({ applicationId: z.string().uuid(), status: z.enum(["shortlisted", "interview", "offer", "rejected"]), note: z.string().trim().max(2000).optional() });
export default { async fetch(request: Request) {
  if (request.method === "OPTIONS") return options(request);
  if (request.method !== "PATCH") return response(request, { error: "Method not allowed." }, 405, { Allow: "PATCH, OPTIONS" });
  try { const token = bearerToken(request); if (!token) return response(request, { error: "Sign in again to continue." }, 401); const input = await readJson(request, schema); return response(request, await reviewOrganisationApplication(await requireUser(token), input.applicationId, input.status, input.note)); }
  catch (error) { return errorResponse(request, error); }
} };
