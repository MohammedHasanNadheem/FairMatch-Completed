import { z } from "zod";
import { register } from "../../../server/auth-service";
import { errorResponse, options, readJson, response } from "../../../server/http";

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  requestedRole: z.enum(["school_student", "college_student", "job_seeker", "college_coordinator", "college_admin", "company_hr", "company_admin"]),
  organisationName: z.string().trim().min(2).max(160).optional(),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const input = await readJson(request, bodySchema);
      const result = await register(input);
      return response(request, {
        ...result,
        message: "Account created. Email verification delivery is enabled when the production mail provider is configured.",
      }, 201);
    } catch (error) { return errorResponse(request, error); }
  },
};
