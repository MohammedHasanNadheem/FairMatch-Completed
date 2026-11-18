import { requireUser } from "../../server/auth-service";
import { bearerToken } from "../../server/identity";
import { errorResponse, options, response } from "../../server/http";

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "GET") return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, OPTIONS" });
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue.", code: "unauthorised" }, 401);
      return response(request, { user: await requireUser(token) });
    } catch (error) { return errorResponse(request, error); }
  },
};
