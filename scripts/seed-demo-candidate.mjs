import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const privateRailway = databaseUrl.includes(".railway.internal");
const connection = await mysql.createConnection({
  uri: databaseUrl,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1") || privateRailway
    ? undefined
    : { rejectUnauthorized: true },
});

const email = "demo@fairmatch.app";
const [existing] = await connection.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
if (!existing.length) {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash("FairMatchDemo2026!", 12);
  await connection.execute(
    "INSERT INTO users (id, email, password_hash, full_name, role, account_status, email_verified_at) VALUES (?, ?, ?, 'FairMatch Demo Candidate', 'college_student', 'active', UTC_TIMESTAMP())",
    [id, email, passwordHash],
  );
  console.log("Created verified FairMatch demo candidate.");
} else {
  console.log("FairMatch demo candidate already exists.");
}

await connection.end();
