import { z } from "zod";
import { requireUser } from "../../../server/auth-service";
import { closeOrganisationOpportunity, createOrganisationOpportunity, publishOrganisationOpportunity } from "../../../server/organisation-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";

const createSchema = z.object({ action: z.literal("create"), title: z.string().trim().min(2).max(180), type: z.enum(["internship", "placement", "job"]), location: z.string().trim().max(120).optional(), workMode: z.enum(["onsite", "hybrid", "remote"]), description: z.string().trim().min(30).max(20_000), requirements: z.array(z.string().trim().min(1).max(100)).max(30).optional() });
const publishSchema = z.object({ action: z.literal("publish"), opportunityId: z.string().uuid() });
const closeSchema = z.object({ action: z.literal("close"), opportunityId: z.string().uuid() });
const schema = z.discriminatedUnion("action", [createSchema, publishSchema, closeSchema]);

export default { async fetch(request: Request) {
  if (request.method === "OPTIONS") return options(request);
  if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
  try {
    const token = bearerToken(request);
    if (!token) return response(request, { error: "Sign in again to continue." }, 401);
    const actor = await requireUser(token);
    const input = await readJson(request, schema);
    if (input.action === "create") return response(request, await createOrganisationOpportunity(actor, input), 201);
    if (input.action === "publish") return response(request, await publishOrganisationOpportunity(actor, input.opportunityId), 200);
    return response(request, await closeOrganisationOpportunity(actor, input.opportunityId), 200);
  }
  catch (error) { return errorResponse(request, error); }
} };
