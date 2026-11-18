import { z } from "zod";
import { requireUser } from "../../../server/auth-service";
import { atsReadiness } from "../../../server/ats-readiness-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";

const schema = z.object({ targetRole: z.string().trim().max(160).optional(), requirements: z.array(z.string().trim().min(1).max(100)).max(30).optional() });
export default { async fetch(request: Request) { if (request.method === "OPTIONS") return options(request); if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" }); try { const token = bearerToken(request); if (!token) return response(request, { error: "Sign in again to continue." }, 401); return response(request, { readiness: await atsReadiness(await requireUser(token), await readJson(request, schema)) }); } catch (error) { return errorResponse(request, error); } } };
