import { z } from "zod";
import { signOut } from "../../../server/auth-service";
import { clearAuthCookie, cookie, errorResponse, options, readJson, response } from "../../../server/http";

const bodySchema = z.object({ refreshToken: z.string().min(20).max(4096).optional() });

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const token = (await readJson(request, bodySchema)).refreshToken ?? cookie(request, "fairmatch_refresh");
      if (token) await signOut(token);
      return clearAuthCookie(request);
    }
    catch (error) { return errorResponse(request, error); }
  },
};
