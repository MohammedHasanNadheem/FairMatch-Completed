import { z } from "zod";
import { loginPortal } from "../../../server/auth-service";
import { authResponse, errorResponse, options, readJson, response } from "../../../server/http";

const bodySchema = z.object({
  role: z.enum([
    "school_student",
    "college_student",
    "job_seeker",
    "college_coordinator",
    "college_admin",
    "company_hr",
    "company_admin",
    "platform_admin",
  ]),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const input = await readJson(request, bodySchema);
      return authResponse(request, await loginPortal(input.role));
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
