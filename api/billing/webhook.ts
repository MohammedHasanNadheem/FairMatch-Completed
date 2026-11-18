import { createHmac, timingSafeEqual } from "node:crypto";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function validSignature(payload: string, signatureHeader: string, secret: string) {
  const values: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key && value && values[key] == null) values[key] = value;
  }
  const timestamp = Number(values.t);
  const signature = values.v1 ?? "";
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expectedBuffer = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"), "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

type StripeObject = { id?: string; customer?: string; subscription?: string; status?: string; current_period_end?: number; cancel_at_period_end?: boolean; metadata?: Record<string, string>; client_reference_id?: string; items?: { data?: Array<{ current_period_end?: number }> } };
function subscriptionStatus(value?: string) {
  if (value === "active" || value === "trialing" || value === "past_due" || value === "paused") return value;
  return value === "canceled" ? "cancelled" : "paused";
}

async function upsertSubscription(object: StripeObject, eventType: string) {
  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const profileId = object.metadata?.profile_id ?? object.client_reference_id;
  if (!supabaseUrl || !secretKey || !profileId) throw new Error("subscription_configuration_missing");
  const periodEnd = object.current_period_end ?? object.items?.data?.[0]?.current_period_end;
  const body = {
    profile_id: profileId,
    plan_code: object.metadata?.plan_code ?? "career-pro",
    status: eventType === "customer.subscription.deleted" ? "cancelled" : subscriptionStatus(object.status ?? (eventType === "checkout.session.completed" ? "active" : undefined)),
    provider: "stripe",
    provider_customer_id: typeof object.customer === "string" ? object.customer : null,
    provider_subscription_id: typeof (object.subscription ?? object.id) === "string" ? (object.subscription ?? object.id) : null,
    current_period_ends_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: object.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${supabaseUrl}/rest/v1/profile_ai_subscriptions?on_conflict=profile_id`, {
    method: "POST",
    headers: { apikey: secretKey, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`subscription_update_${response.status}`);
}

export const config = { maxDuration: 20 };
async function handle(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return json({ error: "Webhook is not configured." }, 503);
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!validSignature(payload, signature, webhookSecret)) return json({ error: "Invalid signature." }, 400);
  const event = JSON.parse(payload) as { type?: string; data?: { object?: StripeObject } };
  const handled = ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"];
  if (event.type && handled.includes(event.type) && event.data?.object) {
    try { await upsertSubscription(event.data.object, event.type); }
    catch { return json({ error: "Subscription state could not be recorded." }, 500); }
  }
  return json({ received: true });
}

export default { fetch: handle };
