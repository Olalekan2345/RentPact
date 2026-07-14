import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * First real server-side route guard the app has — previously every
 * protected page did its own client-side useAuth() + redirect (still true,
 * left as-is; this is a belt-and-suspenders layer in front of it).
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

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const redirectUrl = new URL("/auth", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization,
     * so the session cookie stays fresh across normal navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
