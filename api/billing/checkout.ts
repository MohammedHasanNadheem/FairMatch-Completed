function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
}

type Profile = { id: string; role: string; active: boolean };

async function authenticate(request: Request) {
  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!supabaseUrl || !publishableKey || !token) return null;
  const headers = { apikey: publishableKey, authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(8_000) });
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id?: string; email?: string };
  if (!user.id) return null;
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,active&limit=1`, { headers, signal: AbortSignal.timeout(8_000) });
  if (!profileResponse.ok) return null;
  const [profile] = await profileResponse.json() as Profile[];
  return profile?.active ? { profile, email: user.email } : null;
}

export const config = { maxDuration: 20 };

async function handle(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const authenticated = await authenticate(request);
  if (!authenticated) return json({ error: "Sign in again before upgrading." }, 401);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_CAREER_PRO_PRICE_ID;
  if (!stripeKey || !priceId) return json({ error: "Secure checkout is not configured yet. The free AI allowance remains active." }, 503);
  if (!["school_student", "college_student", "job_seeker"].includes(authenticated.profile.role)) return json({ error: "Career Pro checkout is available only to candidate accounts." }, 403);

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: authenticated.profile.id,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[profile_id]": authenticated.profile.id,
    "metadata[plan_code]": "career-pro",
    "subscription_data[metadata][profile_id]": authenticated.profile.id,
    "subscription_data[metadata][plan_code]": "career-pro",
    allow_promotion_codes: "true",
  });
  if (authenticated.email) form.set("customer_email", authenticated.email);
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${stripeKey}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `fairmatch-career-pro-${authenticated.profile.id}-${crypto.randomUUID()}` },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as { url?: string; error?: { message?: string } };
    if (!response.ok || !payload.url) return json({ error: payload.error?.message ?? "Secure checkout could not be created." }, 502);
    return json({ url: payload.url });
  } catch {
    return json({ error: "The payment provider did not respond in time." }, 504);
  }
}

export default { fetch: handle };
