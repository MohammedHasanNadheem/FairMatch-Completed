import { z } from "zod";
import { requireUser } from "../../../server/auth-service";
import { createCollegeCohort, createPlacementDrive, updatePlacementDriveStatus } from "../../../server/organisation-service";
import { bearerToken } from "../../../server/identity";
import { errorResponse, options, readJson, response } from "../../../server/http";

const createCohortSchema = z.object({
  action: z.literal("create_cohort"),
  name: z.string().trim().min(2).max(160),
  department: z.string().trim().max(120).optional(),
  graduationYear: z.number().int().min(2020).max(2040),
  eligibilityNotes: z.string().trim().max(500).optional(),
});

const createDriveSchema = z.object({
  action: z.literal("create_drive"),
  cohortId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(180),
  employerName: z.string().trim().min(2).max(160),
  driveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updateDriveSchema = z.object({
  action: z.literal("update_drive_status"),
  driveId: z.string().uuid(),
  status: z.enum(["planned", "open", "completed", "cancelled"]),
});

const schema = z.discriminatedUnion("action", [createCohortSchema, createDriveSchema, updateDriveSchema]);

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    if (request.method !== "POST") return response(request, { error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue." }, 401);
      const actor = await requireUser(token);
      const input = await readJson(request, schema);
      if (input.action === "create_cohort") return response(request, await createCollegeCohort(actor, input), 201);
      if (input.action === "create_drive") return response(request, await createPlacementDrive(actor, input), 201);
      return response(request, await updatePlacementDriveStatus(actor, input.driveId, input.status), 200);
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
