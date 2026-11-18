import { z } from "zod";
import { login } from "../../../server/auth-service";
import { authResponse, errorResponse, options, readJson, response } from "../../../server/http";

const bodySchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const input = await readJson(request, bodySchema);
      return authResponse(request, await login(input.email, input.password));
    }
    catch (error) { return errorResponse(request, error); }
  },
};
