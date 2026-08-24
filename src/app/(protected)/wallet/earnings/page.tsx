"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StatementTab } from "@/components/statement/StatementTab";
import { type StatementVariant } from "@/lib/statement";
import {
  getActivityFeed,
  listLeasesForLandlord,
  listLeasesForTenant,
  type ActivityItem,
  type Lease,
} from "@/lib/leaseData";

const VIEW_KEY = "rentpact:wallet-statement-view:v1";

export default function EarningsSpendingPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [landlordLeases, setLandlordLeases] = useState<Lease[] | null>(null);
  const [tenantLeases, setTenantLeases] = useState<Lease[] | null>(null);
  const [releases, setReleases] = useState<ActivityItem[] | null>(null);
  const [view, setView] = useState<StatementVariant>("earnings");

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  // Initial view: ?view= query (from a report's back link) wins, then the
  // remembered choice, else Earnings.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("view");
      if (q === "earnings" || q === "spending") {
        setView(q);
        return;
      }
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "earnings" || saved === "spending") setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const chooseView = (v: StatementVariant) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!session) return;
    listLeasesForLandlord(session, false).then(setLandlordLeases);
    listLeasesForTenant(session, false).then(setTenantLeases);
    getActivityFeed(session, 1000).then((items) => setReleases(items.filter((i) => i.type === "release")));
  }, [session]);

  if (isLoading || !session) return null;

  const leases = view === "earnings" ? landlordLeases : tenantLeases;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="group"
        aria-label="Earnings or spending"
        className="inline-flex self-start rounded-full border border-forest-100 bg-cream-100 p-1 text-sm font-medium"
      >
        {(["earnings", "spending"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => chooseView(v)}
            aria-pressed={view === v}
            className={`rounded-full px-4 py-1.5 capitalize transition-colors ${
              view === v ? "bg-forest-500 text-cream-50 shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <StatementTab key={view} variant={view} email={session.email} leases={leases} releases={releases} />
    </div>
  );
}
