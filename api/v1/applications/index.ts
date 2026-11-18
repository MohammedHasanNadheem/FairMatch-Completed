import { z } from "zod";
import { createApplication, listCandidateApplications, updateCandidateApplication } from "../../../server/opportunity-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";
import { requireUser } from "../../../server/auth-service";

const bodySchema = z.object({ opportunityId: z.string().uuid(), coverNote: z.string().trim().max(5_000).optional() });
const patchSchema = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(["withdraw", "accept_offer", "decline_offer"]),
  note: z.string().trim().max(2_000).optional(),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue.", code: "unauthorised" }, 401);
      const actor = await requireUser(token);
      if (request.method === "GET") return response(request, { items: await listCandidateApplications(actor) });
      if (request.method === "POST") return response(request, await createApplication(actor, await readJson(request, bodySchema)), 201);
      if (request.method === "PATCH") return response(request, await updateCandidateApplication(actor, await readJson(request, patchSchema)));
      return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, POST, PATCH, OPTIONS" });
    } catch (error) { return errorResponse(request, error); }
  },
};
