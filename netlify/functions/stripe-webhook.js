// Stripe calls this directly (server-to-server) when a Checkout Session completes. Two things
// have to hold for this to be safe: the signature MUST be verified (otherwise anyone could POST
// a fake "payment succeeded" event and grant themselves Pro for free), and this MUST use the
// Supabase service_role key to write license — that key bypasses RLS/column-GRANTs by design,
// which is exactly what a trusted server-side write needs (no user session/JWT exists here at
// all, unlike every other write in this app).
const Stripe = require("stripe");

const SUPABASE_URL = "https://zagelzxqgandqtmndswa.supabase.co";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = event.headers["stripe-signature"];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  try {
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      if (session.payment_status !== "paid") {
        return { statusCode: 200, body: "ignored (not paid)" };
      }

      const userId = session.client_reference_id;
      if (!userId) {
        // Nothing to map this payment back to (e.g. a manually-created Payment Link) — this will
        // never resolve, so acknowledge it rather than making Stripe retry forever.
        return { statusCode: 200, body: "ignored (no client_reference_id)" };
      }

      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        // Setting the same values again on a duplicate webhook delivery (Stripe is at-least-once
        // delivery) is harmless — this PATCH is naturally idempotent. That stops being true the
        // moment anything non-idempotent (e.g. sending a receipt email) gets added here later.
        body: JSON.stringify({
          license: "Pro",
          stripe_customer_id: session.customer,
          pro_purchased_at: new Date().toISOString(),
        }),
      });

      if (!patchRes.ok) {
        // Returning non-2xx makes Stripe retry (with backoff, for up to 3 days) — swallowing
        // this as a 200 would mean a paying customer silently never gets Pro, with no automatic
        // recovery path.
        const detail = await patchRes.text().catch(() => "");
        return { statusCode: 500, body: `Failed to update profile: ${patchRes.status} ${detail}` };
      }
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    return { statusCode: 500, body: `Unexpected error: ${err.message}` };
  }
};
