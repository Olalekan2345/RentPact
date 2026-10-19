import "server-only";
import { NextResponse } from "next/server";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";
import { circleCreateUserToken, circleListWallets } from "@/lib/circleServer";
import { circleUserIdFromEmail } from "@/lib/circleUserId";
import { envResult } from "@/lib/env";

/**
 * Who is calling, read from their Supabase session cookie — never from the request body, which anyone can
 * fill with someone else's email or wallet.
 */
export interface SessionUser {
  email: string;
  /** Supabase auth user id; private uploads live in a folder named after it. */
  id: string;
}

export const isMockMode = () => (envResult.success ? envResult.env.NEXT_PUBLIC_MOCK_MODE : true);

export async function sessionUser(): Promise<SessionUser | null> {
  try {
    const {
      data: { user },
    } = await supabaseRouteHandler().auth.getUser();
    const email = user?.email?.trim().toLowerCase();
    return email && user ? { email, id: user.id } : null;
  } catch {
    return null;
  }
}

/** An error a route returns to the browser as `{ error: message }` with this HTTP status. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await sessionUser();
  if (!user) throw new HttpError("Please sign in again to continue.", 401);
  return user;
}

/**
 * The signed-in user's email. Routes whose callers name an email (`?email=`, `fromEmail`, …) pass it here,
 * so a request can only ever act as the person actually signed in.
 */
export async function requireSelf(claimed: unknown): Promise<string> {
  const { email } = await requireUser();
  if (typeof claimed === "string" && claimed.trim() && claimed.trim().toLowerCase() !== email) {
    throw new HttpError("You can only do this for your own account.", 403);
  }
  return email;
}

/** Turns an HttpError into its response; anything else is a 500 that doesn't leak internals. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  // Next.js signals (dynamic rendering, redirects) travel as thrown errors with a digest; they must propagate.
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && (digest.startsWith("DYNAMIC_SERVER_USAGE") || digest.startsWith("NEXT_"))) throw error;
  console.error(error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** Every Arc wallet address the Circle user behind `email` controls (lowercased). */
export async function walletAddressesFor(email: string): Promise<string[]> {
  try {
    const tokenJson = await circleCreateUserToken(circleUserIdFromEmail(email));
    const userToken: string | undefined = tokenJson?.data?.userToken;
    if (!userToken) return [];
    const walletsJson = await circleListWallets(userToken);
    const wallets: { address?: string }[] = walletsJson?.data?.wallets ?? [];
    return wallets.flatMap((w) => (w.address ? [w.address.toLowerCase()] : []));
  } catch {
    return [];
  }
}

/** Whether `address` is one of `email`'s own wallets. Mock mode has no real wallets, so it always passes. */
export async function ownsWallet(email: string, address: string): Promise<boolean> {
  if (isMockMode()) return true;
  return (await walletAddressesFor(email)).includes(address.toLowerCase());
}
