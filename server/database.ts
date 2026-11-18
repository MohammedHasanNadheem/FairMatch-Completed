import mysql, { type Pool } from "mysql2/promise";
import { requireDatabaseEnvironment } from "./env";

declare global {
  // Vercel may reuse a Node.js function instance. Reusing the pool avoids creating a new pool per request.
  var fairMatchMySqlPool: Pool | undefined;
}

export function database() {
  if (globalThis.fairMatchMySqlPool) return globalThis.fairMatchMySqlPool;
  const { DATABASE_URL } = requireDatabaseEnvironment();
  // Railway's MYSQL_URL uses its private network. It is not a public TLS
  // endpoint, so forcing certificate validation prevents the API from
  // connecting to its own managed MySQL service.
  const usesPrivateRailwayNetwork = DATABASE_URL.includes(".railway.internal");
  globalThis.fairMatchMySqlPool = mysql.createPool({
    uri: DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") || usesPrivateRailwayNetwork
      ? undefined
      : { rejectUnauthorized: true },
  });
  return globalThis.fairMatchMySqlPool;
}

export async function closeDatabaseForTest() {
  if (globalThis.fairMatchMySqlPool) {
    await globalThis.fairMatchMySqlPool.end();
    globalThis.fairMatchMySqlPool = undefined;
  }
}
