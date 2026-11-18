import { z } from "zod";
import { changePassword } from "../../../server/account-service";
import { requireUser } from "../../../server/auth-service";
import { errorResponse, options, readJson, response } from "../../../server/http";
import { bearerToken } from "../../../server/identity";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue." }, 401);
      const actor = await requireUser(token);
      const input = await readJson(request, schema);
      return response(request, await changePassword(actor, input.currentPassword, input.newPassword));
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
