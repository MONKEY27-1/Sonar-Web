// Creates a Stripe Checkout Session for a one-time (lifetime) Sonar Pro purchase.
//
// Never trusts a client-supplied user id — the caller's Supabase access token is verified
// server-side against Supabase itself first, and whatever user id/email that returns is what
// gets attached to the Checkout Session. Without this, anyone could POST an arbitrary id here
// and grant Pro to someone else's account instead of their own.
const Stripe = require("stripe");

// Same public project URL/anon key already baked into js/config.js and the desktop app's
// SupabaseConfig.cs — safe to hardcode, RLS (not key secrecy) is what protects data here.
const SUPABASE_URL = "https://zagelzxqgandqtmndswa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZ2VsenhxZ2FuZHF0bW5kc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjA3OTMsImV4cCI6MjEwMTI5Njc5M30.Uhh3koGFJe5UxfMZY99o87l55G_NOWbzuN4_PIrTI-8";

const PRO_UNLOCKED_LICENSES = new Set(["Pro", "Developer", "Administrator"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return json(401, { message: "You need to be signed in to upgrade." });
  }

  // RLS ("using (auth.uid() = id)") auto-scopes this to exactly the caller's own row — same
  // trick js/api.js's getProfile already relies on, just without an id filter since we don't
  // know it yet. This is both the identity check and the "already Pro?" check in one call.
  let profile;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,email,license,is_beta_tester`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) return json(401, { message: "Your session has expired — please sign in again." });
    const rows = await res.json();
    profile = rows[0];
  } catch {
    return json(401, { message: "Couldn't verify your session — please sign in again." });
  }

  if (!profile) {
    return json(401, { message: "Your session has expired — please sign in again." });
  }

  if (profile.is_beta_tester || PRO_UNLOCKED_LICENSES.has(profile.license)) {
    return json(400, { message: "You already have full Pro access." });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return json(500, { message: "Purchasing isn't configured yet — please check back soon." });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.URL || `https://${event.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: profile.id,
      customer_email: profile.email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${siteUrl}/checkout-success.html`,
      cancel_url: `${siteUrl}/index.html#tiers`,
    });
    return json(200, { url: session.url });
  } catch (err) {
    return json(500, { message: "Couldn't start checkout — please try again." + describeError(err) });
  }
};

function describeError(err) {
  return process.env.NODE_ENV === "development" ? ` (${err.message})` : "";
}

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
