import { NextResponse, type NextRequest } from "next/server";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

/**
 * Where Supabase sends the browser back to after an OAuth provider (Google)
 * approves sign-in. Exchanges the one-time `code` for a real session cookie,
 * then hands off to `next` (defaults to /dashboard) — auth-context.tsx's
 * onAuthStateChange listener picks up the new session automatically from
 * there, same as the password flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // A provider-side failure (e.g. access_denied) comes back as error params, not a code.
  const providerError = searchParams.get("error_description") || searchParams.get("error");

  if (code) {
    const supabase = supabaseRouteHandler();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Most common cause: the PKCE code-verifier cookie was missing/unreadable on return.
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(error.message)}`);
  }

  const reason = providerError || "No sign-in code was returned. Please try again.";
  console.error("[auth/callback] no code in callback:", reason);
  return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(reason)}`);
}
