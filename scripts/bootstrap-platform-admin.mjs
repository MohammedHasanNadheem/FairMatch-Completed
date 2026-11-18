import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "FairMatch Platform Administrator";

if (!databaseUrl || !email || !password) {
  throw new Error("Set DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before running this one-time bootstrap.");
}
if (password.length < 16) throw new Error("Use an administrator password of at least 16 characters.");

const pool = mysql.createPool({ uri: databaseUrl, ssl: databaseUrl.includes("localhost") ? undefined : { rejectUnauthorized: true } });
try {
  const [rows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  if (rows.length) {
    await pool.execute("UPDATE users SET role = 'platform_admin', account_status = 'active', email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE email = ?", [email]);
    console.log(`Promoted the existing FairMatch account for ${email} to platform_admin.`);
  } else {
    await pool.execute("INSERT INTO users (id, email, password_hash, full_name, role, account_status, email_verified_at) VALUES (?, ?, ?, ?, 'platform_admin', 'active', UTC_TIMESTAMP())", [randomUUID(), email, await bcrypt.hash(password, 12), name]);
    console.log(`Created the initial FairMatch platform_admin account for ${email}.`);
  }
} finally { await pool.end(); }
