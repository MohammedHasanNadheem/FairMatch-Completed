import { z } from "zod";
import { errorResponse, options, response } from "../../../server/http";
import { listPublishedOpportunities } from "../../../server/opportunity-service";

const querySchema = z.object({
  q: z.string().max(100).optional(),
  type: z.enum(["internship", "placement", "job"]).optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
  page: z.coerce.number().int().positive().max(10_000).optional(),
  pageSize: z.coerce.number().int().positive().max(50).optional(),
});

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "GET") return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, OPTIONS" });
    try {
      const url = new URL(request.url);
      const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!query.success) return response(request, { error: "Check the opportunity filters." }, 422);
      return response(request, await listPublishedOpportunities({ query: query.data.q, type: query.data.type, workMode: query.data.workMode, page: query.data.page, pageSize: query.data.pageSize }));
    } catch (error) { return errorResponse(request, error); }
  },
};
