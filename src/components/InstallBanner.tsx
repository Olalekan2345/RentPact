"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInstall } from "@/lib/pwa";

/**
 * A persistent, platform-aware "install the app" bar shown across the app for
 * users who haven't installed yet. Deliberately not dismissible — it stays put
 * until the app is actually installed, then hides itself (there's nothing to do
 * once you're running the installed app). Suppressed on the dedicated install
 * page to avoid doubling up.
 */
export function InstallBanner() {
  const pathname = usePathname();
  const { mounted, platform, installed, canPrompt, promptInstall, markInstalled } = useInstall();

  // Render nothing on the server / first client paint (avoids a flash and a
  // hydration mismatch), once installed/acknowledged, or on the install page.
  if (!mounted || installed || pathname === "/settings/install") return null;

  const message =
    platform === "ios"
      ? "Add RentPact to your iPhone’s Home Screen for the full app experience."
      : "Install the RentPact app for a faster, full-screen experience.";

  return (
    <div className="border-b border-forest-100 bg-forest-50/80 px-4 py-2.5 sm:px-8 print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-sm text-forest-700">
          <PhoneIcon className="h-4 w-4 shrink-0 text-forest-500" />
          <span>{message}</span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {canPrompt && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="rounded-full bg-forest-500 px-3.5 py-1 text-xs font-semibold text-cream-50 transition-colors hover:bg-forest-600"
            >
              Install app
            </button>
          )}
          <Link
            href="/settings/install"
            className="text-xs font-medium text-forest-600 underline underline-offset-2 hover:text-forest-500"
          >
            {canPrompt ? "How" : "How to install"}
          </Link>
          <button
            type="button"
            onClick={markInstalled}
            className="text-xs text-forest-600/70 underline underline-offset-2 hover:text-forest-600"
          >
            Already installed?
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M11 18h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
