"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { PropertyImage } from "@/components/PropertyImage";
import { Badge, Card, CardContent, Skeleton } from "@/components/ui";
import { formatUSDC, formatDate } from "@/lib/format";
import { UsdcAmount } from "@/components/UsdcAmount";
import { getDisputeOverview, type ActiveDisputeSummary, type ResolvedDisputeSummary, type DisputeTier } from "@/lib/disputes";
import { DAY_MS, HOUR_MS } from "@/lib/constitution";

const TIER_BADGE: Record<DisputeTier, { label: string; variant: "neutral" | "gold" | "terracotta" }> = {
  tier0: { label: "Tier 0: Under review", variant: "neutral" },
  settlement: { label: "Tier 1: Settlement window", variant: "gold" },
  arbitration: { label: "Tier 2: In arbitration", variant: "terracotta" },
  overdue: { label: "Ruling overdue", variant: "terracotta" },
};

const OUTCOME_BADGE = (landlordBps: number) => {
  if (landlordBps === 10_000) return { label: "Released to landlord", variant: "gold" as const };
  if (landlordBps === 0) return { label: "Refunded to tenant", variant: "forest" as const };
  const pct = (landlordBps / 100).toFixed(0);
  return { label: `Split ${pct}/${100 - Number(pct)}`, variant: "neutral" as const };
};

function countdownLabel(dispute: ActiveDisputeSummary): string {
  const now = Date.now();
  if (dispute.tier === "settlement") {
    const ms = dispute.settlementDeadline - now;
    return `${Math.max(1, Math.ceil(ms / DAY_MS))} day${ms > DAY_MS ? "s" : ""} left to settle`;
  }
  if (dispute.tier === "arbitration") {
    const ms = dispute.arbitrationDeadline - now;
    return `Panel ruling due in ${Math.max(1, Math.ceil(ms / DAY_MS))} day${ms > DAY_MS ? "s" : ""}`;
  }
  return "Ruling deadline passed — anyone can trigger auto-resolution";
}

function reasonSummary(reason: string | null): string {
  if (!reason) return "No reason given";
  const match = reason.match(/^Issue report \[[^\]]+\] \(([^)]+)\): ([^—]+)/);
  if (match) return `${match[1]} — ${match[2].trim()}`;
  return reason.length > 80 ? `${reason.slice(0, 80)}…` : reason;
}

function ActiveDisputeCard({ dispute }: { dispute: ActiveDisputeSummary }) {
  const { lease, role } = dispute;
  const badge = TIER_BADGE[dispute.tier];
  const counterparty = role === "tenant" ? lease.landlordEmail : lease.tenantEmail;

  return (
    <Link
      href={`/leases/${lease.id}/dispute`}
      className="block overflow-hidden rounded-lg border border-forest-100/60 bg-cream-100 shadow-card transition-shadow hover:shadow-lifted"
    >
      <div className="flex gap-4 p-4">
        <PropertyImage
          seed={lease.id}
          propertyType={lease.propertyType}
          overrideUrl={lease.photoUrl}
          alt={lease.propertyAddress}
          className="h-20 w-20 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-serif text-base text-ink">{lease.propertyAddress}</h3>
            <Badge variant={badge.variant} className="shrink-0">
              {badge.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-semibold text-gold-600">{formatUSDC(dispute.frozenAmount)} USDC frozen</p>
          <p className="mt-1 text-xs text-terracotta-500">{countdownLabel(dispute)}</p>
          <p className="mt-1.5 text-xs text-ink-soft">
            {role === "tenant" ? "Landlord" : "Tenant"}: {counterparty}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{reasonSummary(lease.disputeReason)}</p>
        </div>
      </div>
    </Link>
  );
}

function ResolvedDisputeRow({ dispute }: { dispute: ResolvedDisputeSummary }) {
  const badge = OUTCOME_BADGE(dispute.landlordBps);
  return (
    <Link
      href={`/leases/${dispute.lease.id}/dispute`}
      className="flex items-center justify-between gap-3 border-b border-forest-100/60 px-1 py-3 text-sm last:border-b-0 hover:bg-cream-100"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{dispute.lease.propertyAddress}</p>
        <p className="text-xs text-ink-soft">{formatDate(new Date(dispute.resolvedAt), "long")}</p>
      </div>
      <Badge variant={badge.variant} className="shrink-0">
        {badge.label}
      </Badge>
    </Link>
  );
}

export default function DisputesPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getDisputeOverview>> | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    getDisputeOverview(session).then(setOverview);
  }, [session]);

  const avgResolutionLabel = useMemo(() => {
    if (!overview || overview.avgResolutionMs === null) return "—";
    const days = overview.avgResolutionMs / DAY_MS;
    if (days >= 1) return `${days.toFixed(1)} days`;
    return `${Math.round(overview.avgResolutionMs / HOUR_MS)} hours`;
  }, [overview]);

  if (isLoading || !session) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Disputes</h1>
        <p className="mt-1 text-ink-muted">Evidence decides, not argument — every dispute in one place.</p>

        {overview === null ? (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold text-ink">{overview.active.length}</p>
                  <p className="text-xs text-ink-soft">Active disputes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="flex items-baseline gap-1 text-2xl font-semibold text-gold-600">
                    <UsdcAmount amount={overview.frozenTotal} />
                  </p>
                  <p className="text-xs text-ink-soft">Frozen total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold text-ink">{avgResolutionLabel}</p>
                  <p className="text-xs text-ink-soft">Avg. resolution time</p>
                </CardContent>
              </Card>
            </div>

            {overview.active.length === 0 && overview.resolved.length === 0 ? (
              <div className="mt-10 text-center">
                <p className="text-lg text-ink">No disputes — that&apos;s how it should be 🌿</p>
                <Link href="/constitution" className="mt-2 inline-block text-sm text-forest-500 underline">
                  How disputes work — Article IV of the Constitution
                </Link>
              </div>
            ) : (
              <>
                {overview.active.length > 0 && (
                  <div className="mt-8">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Active disputes</h2>
                    <div className="mt-3 space-y-3">
                      {overview.active.map((d) => (
                        <ActiveDisputeCard key={d.lease.id} dispute={d} />
                      ))}
                    </div>
                  </div>
                )}

                {overview.resolved.length > 0 && (
                  <div className="mt-8">
                    <button
                      onClick={() => setArchiveOpen((v) => !v)}
                      className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-ink-soft"
                    >
                      Resolved disputes ({overview.resolved.length})
                      <span className="text-ink-soft">{archiveOpen ? "Hide" : "Show"}</span>
                    </button>
                    {archiveOpen && (
                      <Card className="mt-3">
                        <CardContent className="p-2">
                          {overview.resolved.map((d, i) => (
                            <ResolvedDisputeRow key={`${d.lease.id}-${d.resolvedAt}-${i}`} dispute={d} />
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
