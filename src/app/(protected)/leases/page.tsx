"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LeaseCard } from "@/components/LeaseCard";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui";
import { listLeasesForTenant, listLeasesForLandlord, leaseStatus, type Lease, type LeaseStatus } from "@/lib/leaseData";

const FILTERS: { value: LeaseStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting-signature", label: "Pending signature" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "Disputed" },
  { value: "cancelled", label: "Cancelled" },
];

interface Row {
  lease: Lease;
  role: "tenant" | "landlord";
}

export default function LeasesPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [tenantLeases, setTenantLeases] = useState<Lease[] | null>(null);
  const [landlordLeases, setLandlordLeases] = useState<Lease[] | null>(null);
  const [filter, setFilter] = useState<LeaseStatus | "all">("all");

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    listLeasesForTenant(session).then(setTenantLeases);
    listLeasesForLandlord(session).then(setLandlordLeases);
  }, [session]);

  const rows: Row[] | null = useMemo(() => {
    if (tenantLeases === null || landlordLeases === null) return null;
    const combined: Row[] = [
      ...tenantLeases.map((lease) => ({ lease, role: "tenant" as const })),
      ...landlordLeases.map((lease) => ({ lease, role: "landlord" as const })),
    ];
    return combined.sort((a, b) => b.lease.createdAt - a.lease.createdAt);
  }, [tenantLeases, landlordLeases]);

  const filtered = rows?.filter((r) => filter === "all" || leaseStatus(r.lease) === filter) ?? null;

  const counts = useMemo(() => {
    if (!rows) return null;
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      const s = leaseStatus(r.lease);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  if (isLoading || !session) return null;

  return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Leases</h1>
        <p className="mt-1 text-ink-muted">Every rental agreement you&apos;re party to, as tenant or landlord.</p>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                filter === f.value
                  ? "border-forest-500 bg-forest-500 text-cream-50"
                  : "border-forest-100 text-ink-muted hover:border-forest-200"
              }`}
            >
              {f.label}
              {counts && counts[f.value] ? ` (${counts[f.value]})` : ""}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {filtered === null ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No leases yet" : "No leases in this state"}
              body={
                filter === "all"
                  ? "Browse listings to rent a place, or publish one as a landlord."
                  : "Nothing matches this filter right now."
              }
              ctaLabel={filter === "all" ? "Browse listings" : undefined}
              ctaHref={filter === "all" ? "/listings" : undefined}
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(({ lease, role }) => (
                <LeaseCard key={`${role}-${lease.id}`} lease={lease} viewerRole={role} />
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
