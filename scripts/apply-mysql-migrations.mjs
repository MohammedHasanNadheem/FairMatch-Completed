import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const usesPrivateRailwayNetwork = databaseUrl.includes(".railway.internal");

const connection = await mysql.createConnection({
  uri: databaseUrl,
  multipleStatements: true,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1") || usesPrivateRailwayNetwork
    ? undefined
    : { rejectUnauthorized: true },
});

try {
  for (const file of ["001_fairmatch_mvp.sql", "002_candidate_evidence.sql", "003_complete_workflows.sql"]) {
    const sql = await readFile(resolve("database/mysql", file), "utf8");
    await connection.query(sql);
    console.log(`Applied ${file}`);
  }
} finally {
  await connection.end();
}
