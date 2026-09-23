"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DashboardIcon,
  LeasesIcon,
  BrowseIcon,
  MessagesIcon,
  WalletIcon,
  ListPropertyIcon,
  DisputeIcon,
  ProfileIcon,
} from "@/components/icons/NavIcons";

/**
 * Floating, premium mobile bottom nav: five core tabs in a forest "pill" that
 * floats off the screen edges, plus a gold FAB that opens the less-frequent
 * destinations (List a property, Disputes, Profile). Desktop uses the sidebar;
 * this is md:hidden.
 */

const CORE = [
  { href: "/dashboard", label: "Home", Icon: DashboardIcon },
  { href: "/leases", label: "Leases", Icon: LeasesIcon },
  { href: "/listings", label: "Browse", Icon: BrowseIcon },
  { href: "/messages", label: "Messages", Icon: MessagesIcon },
  { href: "/wallet", label: "Wallet", Icon: WalletIcon },
] as const;

const MORE = [
  { href: "/listings/new", label: "List a property", Icon: ListPropertyIcon },
  { href: "/disputes", label: "Disputes", Icon: DisputeIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 md:hidden print:hidden">
      {open && (
        <button
          type="button"
          aria-label="Close quick actions"
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-ink/20 backdrop-blur-[1px]"
        />
      )}

      <div className="relative z-10 mx-auto flex max-w-md items-end gap-3 px-3 pb-3 pt-2">
        {/* Floating pill of core tabs */}
        <nav className="flex flex-1 items-center justify-around rounded-full border border-cream-50/10 bg-forest-600/95 px-1.5 py-1.5 shadow-lifted backdrop-blur-md">
          {CORE.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                  active ? "text-gold-400" : "text-cream-100/60 hover:text-cream-50",
                )}
              >
                {active && <span aria-hidden className="absolute inset-0 rounded-full bg-gold-400/15" />}
                <Icon className="relative h-[22px] w-[22px]" />
              </Link>
            );
          })}
        </nav>

        {/* FAB + quick-actions menu */}
        <div className="relative shrink-0">
          {open && (
            <div className="absolute bottom-[68px] right-0 flex flex-col items-end gap-2">
              {MORE.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-full border border-forest-100 bg-cream-50 py-1.5 pl-4 pr-1.5 text-sm font-medium text-ink shadow-lifted"
                >
                  {label}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-500 text-cream-50">
                    <Icon className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close quick actions" : "Open quick actions"}
            aria-expanded={open}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-400 text-forest-700 shadow-gold transition-transform active:scale-95"
          >
            <PlusIcon className={cn("h-6 w-6 transition-transform duration-200", open && "rotate-45")} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
