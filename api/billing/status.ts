export default {
  fetch() {
    const stripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_CAREER_PRO_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
    return Response.json({ configured: stripe, provider: stripe ? "stripe" : null }, {
      headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
    });
  },
};
