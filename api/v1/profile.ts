import { z } from "zod";
import { requireUser } from "../../server/auth-service";
import { getCandidateProfile, updateCandidateProfile } from "../../server/profile-service";
import { bearerToken } from "../../server/identity";
import { errorResponse, options, readJson, response } from "../../server/http";

const stringList = z.array(z.string().trim().min(1).max(100)).max(40);
const bodySchema = z.object({
  headline: z.string().trim().max(180).optional(),
  location: z.string().trim().max(120).optional(),
  skills: stringList.optional(),
  preferences: z.object({
    targetRoles: stringList.optional(),
    preferredLocations: stringList.optional(),
    workModes: z.array(z.enum(["onsite", "hybrid", "remote"])).max(3).optional(),
    opportunityTypes: z.array(z.enum(["internship", "placement", "job"])).max(3).optional(),
  }).optional(),
  visibility: z.enum(["private", "application_only", "discoverable"]).optional(),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue.", code: "unauthorised" }, 401);
      const actor = await requireUser(token);
      if (request.method === "GET") return response(request, { profile: await getCandidateProfile(actor) });
      if (request.method === "PATCH") return response(request, { profile: await updateCandidateProfile(actor, await readJson(request, bodySchema)) });
      return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, PATCH, OPTIONS" });
    } catch (error) { return errorResponse(request, error); }
  },
};
