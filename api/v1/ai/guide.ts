import { z } from "zod";
import { requireUser } from "../../../server/auth-service";
import { guidedAdvice } from "../../../server/ai-guide-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";
const schema = z.object({ message: z.string().trim().min(2).max(4000), context: z.enum(["career_guidance", "opportunity_match", "application_support", "cohort_insight", "recruiting_support", "platform_operations"]) });
export default { async fetch(request: Request) { if (request.method === "OPTIONS") return options(request); if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" }); try { const token = bearerToken(request); if (!token) return response(request, { error: "Sign in again to use FairMatch Guide." }, 401); return response(request, { answer: await guidedAdvice(await requireUser(token), await readJson(request, schema)) }); } catch (error) { return errorResponse(request, error); } } };
