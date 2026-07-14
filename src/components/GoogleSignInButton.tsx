"use client";

import { useState, type SVGProps } from "react";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * OAuth sign-in — doesn't send any email at all, Google verifies identity
 * itself. Sidesteps the whole SMTP/rate-limit dependency the password flow
 * still has for account recovery down the line. `next` lets a caller (e.g.
 * the lease-invite page) send the user back to where they started instead
 * of the default /dashboard.
 */
export function GoogleSignInButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);

    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) setLoading(false); // on success the browser navigates away, so only reset on failure
  };

  return (
    <Button type="button" variant="secondary" size="lg" onClick={handleClick} disabled={loading} className="w-full">
      <span className="flex items-center justify-center gap-2">
        <GoogleIcon className="h-4 w-4" />
        {loading ? "Redirecting…" : "Continue with Google"}
      </span>
    </Button>
  );
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" {...props} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.33-.17-1.96H10v3.71h5.38a4.6 4.6 0 01-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.27z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0010 20z"
      />
      <path fill="#FBBC05" d="M4.41 11.9A6 6 0 014.09 10c0-.66.11-1.3.32-1.9V5.51H1.06A10 10 0 000 10c0 1.61.39 3.14 1.06 4.49l3.35-2.59z" />
      <path
        fill="#EA4335"
        d="M10 3.98c1.47 0 2.79.5 3.82 1.49l2.87-2.87C14.95.99 12.7 0 10 0 6.09 0 2.7 2.24 1.06 5.51l3.35 2.59C5.2 5.74 7.4 3.98 10 3.98z"
      />
    </svg>
  );
}
