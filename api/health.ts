import { database } from "../server/database";
import { readEnvironment } from "../server/env";

export default {
  async fetch() {
    let databaseConnected = false;
    try {
      const environment = readEnvironment();
      if (environment.DATABASE_URL && environment.JWT_SECRET) {
        await database().query("SELECT 1");
        databaseConnected = true;
      }
    } catch { databaseConnected = false; }
    return Response.json({
      service: "fairmatch-api",
      status: databaseConnected ? "ready" : "degraded",
      checks: { database: databaseConnected, guidedAi: "private_explainable", atsReadiness: "private_explainable" },
      note: "Guidance and ATS readiness run inside FairMatch without transferring profile data to an external AI provider.",
    }, {
      status: databaseConnected ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  },
};
