import { z } from "zod";
import { readEnvironment } from "./env";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function requestOrigin(request: Request) {
  return request.headers.get("origin")?.replace(/\/$/, "") ?? null;
}

export function corsHeaders(request: Request): Record<string, string> {
  const environment = readEnvironment();
  const origin = requestOrigin(request);
  const allowed = [environment.APP_ORIGIN, environment.ANDROID_APP_ORIGIN]
    .flatMap((item) => (item ? item.split(",") : []))
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-fairmatch-client",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function response(request: Request, body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...corsHeaders(request), ...extra } });
}

export function options(request: Request) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Max-Age": "86400" } });
}

export function cookie(request: Request, name: string) {
  const value = request.headers.get("cookie") ?? "";
  return value.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export function authResponse(request: Request, payload: { accessToken: string; refreshToken: string; user: unknown }, status = 200) {
  const isAndroid = request.headers.get("x-fairmatch-client") === "android";
  if (isAndroid) return response(request, payload, status);
  const isHttps = readEnvironment().NODE_ENV === "production" || request.headers.get("x-forwarded-proto") === "https";
  const secureAttribute = isHttps ? "; Secure" : "";
  return response(request, { accessToken: payload.accessToken, user: payload.user }, status, {
    "Set-Cookie": `fairmatch_refresh=${encodeURIComponent(payload.refreshToken)}; HttpOnly${secureAttribute}; SameSite=Lax; Path=/api/v1/auth; Max-Age=${30 * 24 * 60 * 60}`,
  });
}

export function clearAuthCookie(request: Request) {
  const isHttps = readEnvironment().NODE_ENV === "production" || request.headers.get("x-forwarded-proto") === "https";
  const secureAttribute = isHttps ? "; Secure" : "";
  return response(request, { signedOut: true }, 200, {
    "Set-Cookie": `fairmatch_refresh=; HttpOnly${secureAttribute}; SameSite=Lax; Path=/api/v1/auth; Max-Age=0`,
  });
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new HttpError(400, "invalid_json", "The request body must be valid JSON."); }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(422, "invalid_input", "Check the highlighted fields and try again.");
  return result.data;
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function errorResponse(request: Request, error: unknown) {
  if (error instanceof HttpError) return response(request, { error: error.message, code: error.code }, error.status);
  console.error("FairMatch API error", error);
  return response(request, { error: "The service could not complete this request.", code: "internal_error" }, 500);
}
