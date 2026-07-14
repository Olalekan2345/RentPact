"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { PropertyImage } from "@/components/PropertyImage";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { formatUSDC, formatDate, formatDateTime } from "@/lib/format";
import { leaseStatus, nextReleaseDate, type Lease } from "@/lib/leaseData";

const STATUS_BADGE: Record<ReturnType<typeof leaseStatus>, { label: string; variant: "forest" | "gold" | "terracotta" | "neutral" }> = {
  "awaiting-signature": { label: "Awaiting signature", variant: "neutral" },
  active: { label: "Active", variant: "forest" },
  disputed: { label: "Disputed", variant: "terracotta" },
  completed: { label: "Completed", variant: "gold" },
  cancelled: { label: "Cancelled", variant: "neutral" },
};

export function LeaseCard({ lease, viewerRole }: { lease: Lease; viewerRole: "tenant" | "landlord" }) {
  const status = leaseStatus(lease);
  const badge = STATUS_BADGE[status];
  const next = nextReleaseDate(lease);
  const counterpartyEmail = viewerRole === "tenant" ? lease.landlordEmail : lease.tenantEmail;
  const counterpartyLabel = viewerRole === "tenant" ? "Landlord" : "Tenant";

  return (
    <Link
      href={`/leases/${lease.id}`}
      className="group block overflow-hidden rounded-lg border border-forest-100/60 bg-cream-100 shadow-card transition-shadow hover:shadow-lifted"
    >
      <PropertyImage
        seed={lease.id}
        propertyType={lease.propertyType}
        overrideUrl={lease.photoUrl}
        alt={lease.propertyAddress}
        className="h-36 w-full"
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-lg text-ink">{lease.propertyAddress}</h3>
          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {counterpartyLabel}: {counterpartyEmail}
        </p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 font-semibold text-ink">
            <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
            {formatUSDC(lease.amountPerPeriod)} <span className="text-ink-soft">USDC / period</span>
          </span>
          {next && (
            <span className="text-ink-soft">
              Next: {lease.frequency === "daily" || lease.frequency === "hourly" ? formatDateTime(next) : formatDate(next)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
