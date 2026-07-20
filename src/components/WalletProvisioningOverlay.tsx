"use client";

import { useAuth } from "@/lib/auth-context";

/**
 * Full-screen overlay shown while a first-time wallet is being provisioned
 * with Circle — an on-chain smart-contract-wallet deployment that takes a few
 * seconds. Mounted once globally (root layout) rather than per-page, because
 * the OAuth callback lands the user on /dashboard, so that's where the wait
 * actually happens, not on /auth. Returning users have a cached wallet and
 * never see this. See auth-context.tsx's isProvisioningWallet.
 */
export function WalletProvisioningOverlay() {
  const { isProvisioningWallet } = useAuth();
  if (!isProvisioningWallet) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cream/95 px-4 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-forest-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 animate-spin text-forest-500" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <h1 className="font-serif text-xl text-ink">Setting up your secure wallet</h1>
          <p className="mt-2 text-sm text-ink-muted">
            We&apos;re creating your wallet with Circle — no seed phrase, no gas to manage. This is a one-time setup
            and takes a few seconds.
          </p>
        </div>
        <p className="text-xs text-ink-soft">
          You may be asked to set a PIN — that&apos;s how you&apos;ll approve payments later.
        </p>
      </div>
    </div>
  );
}
