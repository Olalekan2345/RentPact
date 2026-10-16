import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Privy is used for one thing only: proving a person controls an email address (Privy sends and checks
 * the 6-digit code — no SMTP or domain needed on our side). Accounts, sessions and wallets stay on
 * Supabase + Circle, keyed by that email, exactly as for Google sign-in.
 *
 * Nothing the browser *says* about the email is trusted: the access token's signature is verified
 * against Privy's published keys, and the email is then read from Privy's own record of the user.
 */
const PRIVY_API = "https://auth.privy.io/api/v1";

function privyCredentials() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET are not set — see SETUP.md.");
  }
  return { appId, appSecret };
}

export function privyConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);
}

// jose caches the fetched keys and refreshes them when Privy rotates.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function privyKeys(appId: string) {
  jwks ??= createRemoteJWKSet(new URL(`${PRIVY_API}/apps/${appId}/jwks.json`));
  return jwks;
}

/** Verifies a Privy access token and returns the Privy user ID (DID). Throws if it isn't genuine or has expired. */
export async function verifyPrivyAccessToken(accessToken: string): Promise<string> {
  const { appId } = privyCredentials();
  const { payload } = await jwtVerify(accessToken, privyKeys(appId), {
    issuer: "privy.io",
    audience: appId,
    algorithms: ["ES256"],
  });
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Privy token has no user ID");
  return payload.sub;
}

interface PrivyLinkedAccount {
  type: string;
  address?: string;
}

/** The verified email Privy holds for this user (lower-cased), or null if they have none. */
export async function privyVerifiedEmail(privyUserId: string): Promise<string | null> {
  const { appId, appSecret } = privyCredentials();
  const res = await fetch(`${PRIVY_API}/users/${encodeURIComponent(privyUserId)}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      "privy-app-id": appId,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Privy user lookup failed (${res.status})`);
  const user = (await res.json()) as { linked_accounts?: PrivyLinkedAccount[] };
  const email = user.linked_accounts?.find((a) => a.type === "email" && typeof a.address === "string")?.address;
  return email ? email.trim().toLowerCase() : null;
}
