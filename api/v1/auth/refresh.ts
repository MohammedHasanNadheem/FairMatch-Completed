import { z } from "zod";
import { refresh } from "../../../server/auth-service";
import { authResponse, cookie, errorResponse, options, readJson, response } from "../../../server/http";

const bodySchema = z.object({ refreshToken: z.string().min(20).max(4096).optional() });

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const token = (await readJson(request, bodySchema)).refreshToken ?? cookie(request, "fairmatch_refresh");
      if (!token) return response(request, { error: "Your session has expired. Sign in again.", code: "invalid_refresh" }, 401);
      return authResponse(request, await refresh(token));
    }
    catch (error) { return errorResponse(request, error); }
  },
};
