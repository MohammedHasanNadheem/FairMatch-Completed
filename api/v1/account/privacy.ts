import { z } from "zod";
import { createPrivacyRequest, exportAccountData, listPrivacyRequests } from "../../../server/account-service";
import { requireUser } from "../../../server/auth-service";
import { errorResponse, options, readJson, response } from "../../../server/http";
import { bearerToken } from "../../../server/identity";

const postSchema = z.object({
  requestType: z.enum(["export", "deletion"]),
  notes: z.string().trim().max(1_000).optional(),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue." }, 401);
      const actor = await requireUser(token);
      if (request.method === "GET") {
        const url = new URL(request.url, "https://fairmatch.local");
        if (url.searchParams.get("export") === "1") {
          return response(request, await exportAccountData(actor));
        }
        return response(request, { items: await listPrivacyRequests(actor) });
      }
      if (request.method === "POST") {
        const input = await readJson(request, postSchema);
        return response(request, await createPrivacyRequest(actor, input), 201);
      }
      return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, POST, OPTIONS" });
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
