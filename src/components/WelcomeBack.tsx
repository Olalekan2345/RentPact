"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { LogoMark } from "@/components/Logo";

/**
 * A warm "welcome back" banner on the dashboard for returning users. Kept
 * deliberately transient and side-effect-free:
 *  - shows once per browser session (sessionStorage), so it greets you on
 *    login but never nags on every in-app navigation or refresh;
 *  - only renders for a returning user (the caller passes show=false for a
 *    brand-new user, who instead gets the GettingStarted card);
 *  - reads nothing but the session email — no wallet/contract/network calls.
 */

const TAGLINES = [
  "Your keys, your rent, your rules — enforced by code, not trust.",
  "Every payment held in escrow and accounted for, right on-chain.",
  "No middlemen, no frozen deposits — just the agreement, kept.",
  "Where a handshake becomes a smart contract.",
  "Rent that protects both sides — automatically, on schedule.",
  "A home you rent with proof, not promises.",
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Best-effort friendly first name from an email local-part; "" if it isn't name-like. */
function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const token = (local.split(/[._-]/)[0] ?? "").replace(/\d+/g, "");
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function WelcomeBack({ show }: { show: boolean }) {
  const { session } = useAuth();
  const sessionKey = session ? `rentpact:welcomed-back:v1:${session.email}` : null;
  const [visible, setVisible] = useState(false);

  // Pick once per mount so nothing flickers on re-render.
  const tagline = useMemo(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)], []);
  const hello = useMemo(() => greeting(), []);
  const name = useMemo(() => (session ? displayName(session.email) : ""), [session]);

  useEffect(() => {
    if (!show || !sessionKey) return;
    let already = false;
    try {
      already = window.sessionStorage.getItem(sessionKey) === "1";
    } catch {
      already = false;
    }
    if (already) return;
    setVisible(true);
    try {
      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [show, sessionKey]);

  const dismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.25, ease: "easeIn" } }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-8 overflow-hidden rounded-2xl border border-forest-100 shadow-card"
        >
          <div className="relative bg-forest-gradient px-5 py-6 sm:px-8 sm:py-7">
            {/* soft ambient glows */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-gold-400/10 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 left-1/4 h-44 w-44 rounded-full bg-forest-300/25 blur-3xl"
            />

            {/* dismiss */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-cream-200/70 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="relative flex items-center gap-4 sm:gap-5">
              {/* pulsing crest */}
              <div className="relative hidden shrink-0 sm:flex">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-2xl bg-gold-400/25 blur-md animate-frost-pulse"
                />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-50/10 ring-1 ring-cream-50/20 backdrop-blur-sm">
                  <LogoMark size={30} chip />
                </span>
              </div>

              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-400">
                  <span>
                    {hello}
                    {name ? `, ${name}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-50/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-cream-200/90 ring-1 ring-cream-50/10">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Secured on Arc
                  </span>
                </p>
                <h2 className="mt-1.5 font-serif text-2xl leading-tight text-cream-50 sm:text-[1.7rem]">
                  Welcome back to your decentralized home
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-cream-200/85">{tagline}</p>
              </div>
            </div>

            {/* gold hairline accent */}
            <div
              aria-hidden
              className="mt-5 h-px w-full bg-gradient-to-r from-gold-400/70 via-cream-50/10 to-transparent"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
