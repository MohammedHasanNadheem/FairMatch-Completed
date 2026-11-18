import { database } from "../server/database";
import { readEnvironment } from "../server/env";

export default {
  async fetch() {
    const checks = {
      database: false,
      guidedMode: true,
    };
    try {
      const environment = readEnvironment();
      if (environment.DATABASE_URL && environment.JWT_SECRET) {
        await database().query("SELECT 1");
        checks.database = true;
      }
    } catch {
      checks.database = false;
    }
    const ready = checks.database;
    return Response.json(
      {
        service: "fairmatch-api",
        status: ready ? "ready" : "degraded",
        checks,
      },
      {
        status: ready ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  },
};
