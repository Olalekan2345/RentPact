"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/wallet", label: "Overview" },
  { href: "/wallet/transactions", label: "Transactions" },
  { href: "/wallet/earnings", label: "Earnings" },
] as const;

export default function WalletLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Wallet</h1>

        <div className="mt-6 flex gap-1 border-b border-forest-100 pb-px">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-forest-500 text-forest-500"
                    : "border-transparent text-ink-soft hover:text-ink-muted",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </AppShell>
  );
}
