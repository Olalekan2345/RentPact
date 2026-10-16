import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";
import { privyConfigured, privyVerifiedEmail, verifyPrivyAccessToken } from "@/lib/privyServer";

export const dynamic = "force-dynamic";

/**
 * Email-code sign-in, step 2 of 2. The browser has just proven it controls an email address with a
 * Privy one-time code; this exchanges that proof for a normal Supabase session cookie — the same
 * session Google sign-in produces — so every page after this is unchanged.
 *
 * Same email, same account: Supabase finds the existing user for the email (e.g. one created by Google
 * sign-in) or creates it, and the app keys data and the Circle wallet by email, so a person never ends
 * up with two accounts whichever way they sign in.
 */
export async function POST(request: Request) {
  if (!privyConfigured()) {
    return NextResponse.json({ error: "Email sign-in isn't set up yet." }, { status: 503 });
  }

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return NextResponse.json({ error: "Missing sign-in proof." }, { status: 401 });

  let email: string | null;
  try {
    const privyUserId = await verifyPrivyAccessToken(accessToken);
    email = await privyVerifiedEmail(privyUserId);
  } catch {
    return NextResponse.json({ error: "We couldn't confirm that code. Please request a new one." }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "No verified email on this sign-in." }, { status: 400 });
  }

  const admin = supabaseAdmin().auth.admin;

  // A one-time sign-in token for this email. generateLink never sends an email; the token is redeemed
  // right here on the server and never reaches the browser.
  let link = await admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    // First time we've seen this email: create the account (already verified — Privy just checked it).
    const created = await admin.createUser({ email, email_confirm: true });
    if (created.error && !/already/i.test(created.error.message)) {
      return NextResponse.json({ error: "Couldn't create your account. Please try again." }, { status: 500 });
    }
    link = await admin.generateLink({ type: "magiclink", email });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    return NextResponse.json({ error: "Couldn't start your session. Please try again." }, { status: 500 });
  }

  // Redeem it with the cookie-aware client: this sets the Supabase session cookies on the response.
  const { error } = await supabaseRouteHandler().auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) {
    return NextResponse.json({ error: "Couldn't start your session. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
