"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { LogoMark } from "@/components/Logo";
import { BrowseIcon, ListPropertyIcon } from "@/components/icons/NavIcons";

/**
 * First-run welcome card on the dashboard. Deliberately passive and safe:
 *  - never renders while the Circle wallet is still being provisioned
 *    (isProvisioningWallet), so it can't collide with wallet setup;
 *  - only shows for a brand-new user (no leases, no listings) who hasn't
 *    dismissed it — so it never interrupts anyone mid-task;
 *  - touches no wallet/auth/contract code — it just reads a dismissed flag
 *    from localStorage and renders links.
 */
export function GettingStarted({ show }: { show: boolean }) {
  const { session, isProvisioningWallet } = useAuth();
  const storageKey = session ? `rentpact:onboarding-dismissed:v1:${session.email}` : null;

  const [dismissed, setDismissed] = useState(true); // start dismissed to avoid a flash before the flag is read
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
        /* ignore quota */
      }
    }
  };

  if (!show || dismissed || isProvisioningWallet) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative mb-8 overflow-hidden rounded-2xl border border-forest-100 bg-cream-100 shadow-card"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-cream-100/80 transition-colors hover:bg-cream-50/20 hover:text-cream-50"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Branded header band */}
      <div className="relative bg-[linear-gradient(135deg,#0B3D2E_0%,#0A4A3F_100%)] px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <LogoMark size={26} chip />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-400">Welcome to RentPact</p>
            <h2 className="mt-0.5 font-serif text-2xl leading-tight text-cream-50">You&apos;re all set 🎉</h2>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm text-cream-200/85">
          A secure wallet was created for you — <span className="font-medium text-cream-50">no seed phrase, no gas</span>.
          Just a PIN. Here&apos;s the deal RentPact keeps for both sides:
        </p>
      </div>

      <div className="p-5 sm:p-7">
        {/* The promise — three steps */}
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
              className="flex items-start gap-3 rounded-lg border border-forest-100/70 bg-cream-50 p-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-500">
                {s.icon}
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{s.title}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{s.body}</span>
              </span>
            </motion.div>
          ))}
        </div>

        {/* First actions */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ActionTile
            href="/listings"
            icon={<BrowseIcon className="h-5 w-5" />}
            title="Find a place to rent"
            body="Browse listings and deposit into escrow — protected from day one."
          />
          <ActionTile
            href="/listings/new"
            icon={<ListPropertyIcon className="h-5 w-5" />}
            title="List a property"
            body="Put a property up and get paid automatically, on schedule."
          />
        </div>

        {/* Trust + Constitution */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-forest-100 pt-4">
          <div className="flex flex-wrap gap-2">
            {["Built on Arc", "Powered by Circle", "Gasless", "USDC"].map((chip) => (
              <span key={chip} className="rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-medium text-forest-600">
                {chip}
              </span>
            ))}
          </div>
          <Link href="/constitution" className="text-xs font-medium text-forest-500 underline underline-offset-2">
            Read the Constitution →
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function ActionTile({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-forest-100 bg-cream-50 p-4 transition-all hover:-translate-y-0.5 hover:border-forest-300 hover:shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-600 transition-colors group-hover:bg-forest-500 group-hover:text-cream-50">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-medium text-ink">
          {title}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{body}</span>
      </span>
    </Link>
  );
}

const STEPS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Held in escrow",
    body: "Rent sits in a smart contract — no one can touch it.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Released on schedule",
    body: "Paid to the landlord automatically, on time.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Frozen on dispute",
    body: "Something wrong? The next payment freezes.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M9.5 12l1.8 1.8L15 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];
