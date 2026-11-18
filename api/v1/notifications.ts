import { z } from "zod";
import { requireUser } from "../../server/auth-service";
import { bearerToken } from "../../server/identity";
import { errorResponse, options, readJson, response } from "../../server/http";
import { listNotifications, markNotificationsRead } from "../../server/notification-service";

const patchSchema = z.object({ notificationId: z.string().uuid().optional() });

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return options(request);
    try {
      const token = bearerToken(request);
      if (!token) return response(request, { error: "Sign in again to continue." }, 401);
      const actor = await requireUser(token);
      if (request.method === "GET") return response(request, await listNotifications(actor));
      if (request.method === "PATCH") {
        const input = await readJson(request, patchSchema).catch(() => ({ notificationId: undefined }));
        return response(request, await markNotificationsRead(actor, input.notificationId));
      }
      return response(request, { error: "Method not allowed." }, 405, { Allow: "GET, PATCH, OPTIONS" });
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
