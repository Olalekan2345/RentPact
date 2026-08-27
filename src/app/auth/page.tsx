"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function AuthPage() {
  const { session, sessionError } = useAuth();
  const router = useRouter();
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  // Surface why an OAuth round-trip bounced back here (set by /auth/callback).
  useEffect(() => {
    try {
      const err = new URLSearchParams(window.location.search).get("error");
      if (err) setOauthError(err);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/"
            aria-label="Back to RentPact home"
            className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-300 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <Logo size={36} wordmarkClassName="text-forest-500" />
          </Link>
          <h1 className="mt-5 text-3xl text-ink">Sign in to RentPact</h1>
          <p className="mt-2 text-ink-muted">Continue with Google to access your account.</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <GoogleSignInButton />
            {sessionError && <p className="text-sm text-terracotta-500">{sessionError}</p>}
            {oauthError && (
              <div className="rounded-md border border-terracotta-200 bg-terracotta-50 p-3 text-sm text-terracotta-600">
                <p className="font-medium">Sign-in didn&apos;t complete</p>
                <p className="mt-1 text-xs">{oauthError}</p>
                <p className="mt-2 text-xs text-terracotta-500">
                  Try again — if it keeps happening, open this page in a private/incognito window, or clear this
                  site&apos;s cookies, then sign in again.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
