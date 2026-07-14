"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/security", label: "Wallet & security" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/currency", label: "Currency" },
  { href: "/settings/language", label: "Language" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/legal", label: "Legal" },
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Settings</h1>

        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-forest-100 pb-px">
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
