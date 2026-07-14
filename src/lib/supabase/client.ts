"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser client for auth-context.tsx. Uses @supabase/ssr's cookie-based
 * session storage (not localStorage) so the session is visible to
 * src/middleware.ts on the server, not just this tab.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — see SETUP.md.");
  }

  return createBrowserClient<Database>(url, key);
}
