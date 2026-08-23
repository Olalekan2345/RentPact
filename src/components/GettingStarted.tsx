"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BrowseIcon, ListPropertyIcon } from "@/components/icons/NavIcons";

/**
 * First-run welcome card on the dashboard. Deliberately passive and safe:
 *  - never renders while the Circle wallet is still being provisioned
 *    (isProvisioningWallet), so it can't collide with wallet setup;
 *  - only shows for a brand-new user (no leases, no listings) who hasn't
 *    dismissed it — so it never interrupts anyone mid-task;
 *  - touches no wallet/auth/contract code — it just reads a dismissed flag
 *    from localStorage and renders links.
 *
 * `show` is passed by the dashboard once its data has loaded and confirms the
 * user is new; this component adds the wallet-ready reassurance + first steps.
 */
export function GettingStarted({ show }: { show: boolean }) {
  const { session, isProvisioningWallet } = useAuth();
  const storageKey = session ? `rentpact:onboarding-dismissed:v1:${session.email}` : null;

  // Start dismissed to avoid a flash before we've read the flag.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const dismiss = () => {
    setDismissed(true);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // ignore quota errors — dismissing for this view is enough
      }
    }
  };

  if (!show || dismissed || isProvisioningWallet) return null;

  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-forest-100 bg-forest-50 p-5 sm:p-6">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <p className="text-sm font-semibold uppercase tracking-wide text-gold-600">Welcome to RentPact</p>
      <h2 className="mt-1 font-serif text-2xl text-ink">You&apos;re all set 🎉</h2>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Your secure wallet is ready — no seed phrase, no gas to buy. Rent is held in escrow and released on schedule,
        so neither side has to trust the other. Here&apos;s how to start:
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          href="/listings"
          className="flex items-start gap-3 rounded-md border border-forest-100 bg-cream-50 p-4 transition-colors hover:border-forest-300"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-600">
            <BrowseIcon className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium text-ink">Find a place to rent</span>
            <span className="mt-0.5 block text-xs text-ink-soft">Browse listings and deposit into escrow.</span>
          </span>
        </Link>

        <Link
          href="/listings/new"
          className="flex items-start gap-3 rounded-md border border-forest-100 bg-cream-50 p-4 transition-colors hover:border-forest-300"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-600">
            <ListPropertyIcon className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium text-ink">List a property</span>
            <span className="mt-0.5 block text-xs text-ink-soft">Put your property up and get paid on schedule.</span>
          </span>
        </Link>
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Every lease follows the{" "}
        <Link href="/constitution" className="text-forest-500 underline">
          RentPact Constitution
        </Link>
        {" "}— the binding rules of escrow and dispute resolution.
      </p>
    </div>
  );
}
