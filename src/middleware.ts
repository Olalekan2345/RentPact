import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Server-side guard for authenticated routes. Public pages (landing, /auth,
 * listings browsing done via API, lease invite links) never touch Supabase
 * here — the check only runs where it's needed, both to keep public pages
 * fast and to avoid Vercel MIDDLEWARE_INVOCATION_TIMEOUT 504s when
 * Supabase's auth endpoint has a slow moment (seen in production).
 *
 * Every protected page also has its own client-side useAuth() redirect, so
 * this is belt-and-suspenders — if the auth check errors out, we fail toward
 * /auth and the client sorts itself out (the /auth page bounces signed-in
 * users straight back to /dashboard).
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leases",
  "/listings",
  "/messages",
  "/wallet",
  "/profile",
  "/settings",
  "/disputes",
];

/** Lease invite links must stay reachable logged-out — the page renders its own inline sign-in. */
const INVITE_PATH = /^\/leases\/[^/]+\/invite\/?$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected =
    !INVITE_PATH.test(pathname) &&
    PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtected) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user) {
    const redirectUrl = new URL("/auth", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization.
     * The protected-prefix check above narrows further; keeping the matcher
     * broad means new protected sections only need a PROTECTED_PREFIXES
     * entry, not a config change.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
