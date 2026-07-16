import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

/**
 * Shared by every signed-in route (dashboard, leases, disputes, listings,
 * messages, wallet, profile, settings — the same set middleware.ts guards).
 * Previously each page imported AppShell itself, which meant Next.js fully
 * unmounted and remounted the sidebar/header (and everything inside it,
 * notably NotificationBell's activity-feed + threads + reviews fetches) on
 * every single navigation between tabs. As a real layout, this instance
 * persists across navigations — only the page content below it swaps.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
