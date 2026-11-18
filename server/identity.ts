import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { requireDatabaseEnvironment } from "./env";

export const publicRoles = ["school_student", "college_student", "job_seeker"] as const;
export const elevatedRoles = ["college_coordinator", "college_admin", "company_hr", "company_admin", "platform_admin"] as const;
export const allRoles = [...publicRoles, ...elevatedRoles] as const;
export type FairMatchRole = typeof allRoles[number];

export type TokenClaims = { sub: string; email: string; role: FairMatchRole; type: "access" | "refresh"; sessionId: string };

function secret() { return new TextEncoder().encode(requireDatabaseEnvironment().JWT_SECRET); }

export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function signToken(claims: TokenClaims, duration: "10m" | "30d") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(duration)
    .sign(secret());
}

export async function verifyToken(token: string, type: TokenClaims["type"]) {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.type !== type || typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.role !== "string" || typeof payload.sessionId !== "string" || !allRoles.includes(payload.role as FairMatchRole)) return null;
    return { sub: payload.sub, email: payload.email, role: payload.role as FairMatchRole, type, sessionId: payload.sessionId } satisfies TokenClaims;
  } catch { return null; }
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}
