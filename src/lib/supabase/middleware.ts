import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Refreshes the Supabase session cookie (if needed) and returns both the
 * response to send and the verified user (or null). Called from
 * src/middleware.ts. Follows @supabase/ssr's standard Next.js middleware
 * pattern — the cookie get/set/remove trio is required for the session to
 * survive across server components, route handlers, and the browser.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Supabase isn't configured yet — don't block the app, just skip the check.
    return { response, user: null };
  }

  const supabase = createServerClient<Database>(url, key, {
    global: {
      // Fail fast instead of hanging: Supabase's auth endpoint occasionally
      // stalls, and an unbounded fetch here turns into a Vercel
      // MIDDLEWARE_INVOCATION_TIMEOUT 504 for the whole page.
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { response, user };
  } catch {
    // Treat an unreachable auth server as "not signed in" — the caller
    // redirects to /auth, and /auth bounces genuinely signed-in users back
    // to the dashboard once the client-side session loads.
    return { response, user: null };
  }
}
