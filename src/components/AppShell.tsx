"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { DashboardIcon, LeasesIcon, BrowseIcon, ListPropertyIcon, MessagesIcon, WalletIcon, ProfileIcon, SettingsIcon, DisputeIcon } from "@/components/icons/NavIcons";
import { NotificationBell } from "@/components/NotificationBell";
import { LogoMark } from "@/components/Logo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/leases", label: "Leases", Icon: LeasesIcon },
  { href: "/disputes", label: "Disputes", Icon: DisputeIcon },
  { href: "/listings", label: "Browse listings", Icon: BrowseIcon },
  { href: "/listings/new", label: "List a property", Icon: ListPropertyIcon },
  { href: "/messages", label: "Messages", Icon: MessagesIcon },
  { href: "/wallet", label: "Wallet", Icon: WalletIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut();
    // Hard navigation: clearing the session first would let the current
    // page's own auth-guard redirect race ahead of a client-side push.
    window.location.assign("/");
  };

  if (!session) return <div className="min-h-screen bg-cream">{children}</div>;

  return (
    <div className="min-h-screen bg-cream md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-forest-500 px-5 py-6 md:flex">
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark size={22} chip />
            <span className="font-serif text-lg tracking-wide text-cream-50">RentPact</span>
          </Link>
          <NotificationBell email={session.email} address={session.address} dark />
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-forest-600 text-cream-50"
                    : "text-cream-100/70 hover:bg-forest-600/60 hover:text-cream-50",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-cream-50/10 pt-4">
          <p className="truncate px-2 pb-2 text-xs text-cream-100/60">{session.email}</p>
          <Link
            href="/settings/account"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/settings")
                ? "bg-forest-600 text-cream-50"
                : "text-cream-100/70 hover:bg-forest-600/60 hover:text-cream-50",
            )}
          >
            <SettingsIcon className="h-[18px] w-[18px] shrink-0" />
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="rounded-md px-3 py-2 text-left text-sm font-medium text-cream-100/70 transition-colors hover:bg-forest-600/60 hover:text-cream-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-forest-100/60 bg-cream-100/90 px-4 py-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark size={24} />
          <span className="font-serif text-xl text-forest-500">RentPact</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell email={session.email} address={session.address} />
          <Link
            href="/settings/account"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-cream-300"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
          <button onClick={handleSignOut} className="text-sm font-medium text-ink-muted">
            Sign out
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-forest-100/60 bg-cream-100/95 backdrop-blur md:hidden">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                isActive ? "text-forest-500" : "text-ink-soft",
              )}
            >
              <Icon className="h-5 w-5" />
              {label === "Browse listings" ? "Browse" : label === "List a property" ? "List" : label}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
    </div>
  );
}
