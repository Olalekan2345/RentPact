"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui";

export function AppHeader() {
  const { session, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    // Hard navigation, not router.push: clearing the session re-renders the
    // current page first, and its own auth-guard effect (e.g. dashboard
    // redirecting to /auth when session becomes null) would otherwise race
    // ahead of a client-side redirect to "/".
    window.location.assign("/");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-forest-100/60 bg-cream-100/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/dashboard" className="font-serif text-xl text-forest-500">
          RentPact
        </Link>
        {session && (
          <div className="flex items-center gap-3">
            <Link href="/listings" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Browse listings
              </Button>
            </Link>
            <Link href="/listings/new" className="hidden sm:block">
              <Button variant="secondary" size="sm">
                List a property
              </Button>
            </Link>
            <span className="hidden text-sm text-ink-soft sm:inline">{session.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
