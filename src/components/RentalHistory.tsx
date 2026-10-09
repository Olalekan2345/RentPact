"use client";

import { useId, useMemo, useState } from "react";
import { Badge, Card, CardContent, Skeleton } from "@/components/ui";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { leaseStatus, type Lease } from "@/lib/leaseData";
import { cn } from "@/lib/utils";

/** How many completed leases show before the rest collapse behind "Show all". */
const PREVIEW_COUNT = 3;

type Role = "Tenant" | "Landlord";

/**
 * Completed-lease history for a profile. Shows only the most recent few, so a
 * long rental record doesn't stretch the whole page; the rest expand on demand
 * into a bounded, scrollable list.
 */
export function RentalHistory({
  tenantLeases,
  landlordLeases,
  unavailable = false,
}: {
  tenantLeases: Lease[] | null;
  landlordLeases: Lease[] | null;
  /** Public profile opened without a wallet address — history can't be read. */
  unavailable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const completed = useMemo(() => {
    const rows: { lease: Lease; role: Role }[] = [
      ...(tenantLeases ?? []).filter((l) => leaseStatus(l) === "completed").map((lease) => ({ lease, role: "Tenant" as const })),
      ...(landlordLeases ?? []).filter((l) => leaseStatus(l) === "completed").map((lease) => ({ lease, role: "Landlord" as const })),
    ];
    // Most recently finished first.
    const finishedAt = (l: Lease) => l.completedAt ?? l.signedAt ?? l.createdAt;
    return rows.sort((a, b) => finishedAt(b.lease) - finishedAt(a.lease));
  }, [tenantLeases, landlordLeases]);

  const asTenant = completed.filter((r) => r.role === "Tenant").length;
  const asLandlord = completed.length - asTenant;
  const hiddenCount = Math.max(0, completed.length - PREVIEW_COUNT);
  const visible = expanded ? completed : completed.slice(0, PREVIEW_COUNT);

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-ink">Rental history</p>
          {completed.length > 0 && (
            <p className="text-xs text-ink-soft">
              {completed.length} completed
              {asTenant > 0 && ` · ${asTenant} as tenant`}
              {asLandlord > 0 && ` · ${asLandlord} as landlord`}
            </p>
          )}
        </div>

        {unavailable ? (
          <p className="mt-2 text-sm text-ink-soft">Not available from this view.</p>
        ) : tenantLeases === null || landlordLeases === null ? (
          <Skeleton className="mt-3 h-16 w-full" />
        ) : completed.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No completed leases yet.</p>
        ) : (
          <>
            <div
              id={listId}
              className={cn("mt-3 flex flex-col gap-2", expanded && "max-h-[26rem] overflow-y-auto pr-1")}
            >
              {visible.map(({ lease, role }) => (
                <HistoryRow key={`${role}-${lease.id}`} lease={lease} role={role} />
              ))}
            </div>

            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={listId}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-forest-100 px-3 py-2.5 text-sm font-medium text-forest-500 transition-colors hover:border-forest-200 hover:bg-forest-50"
              >
                {expanded ? "Show less" : `Show all ${completed.length}`}
                <ChevronIcon className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Every row here is a completed lease, so the badge carries the role instead of repeating "Completed". */
function HistoryRow({ lease, role }: { lease: Lease; role: Role }) {
  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === lease.frequency)?.label ?? lease.frequency;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-forest-100 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium capitalize text-ink">{lease.propertyType}</p>
        <p className="text-xs text-ink-soft">
          {frequencyLabel} · {lease.totalPeriods} periods
        </p>
      </div>
      <Badge variant={role === "Landlord" ? "gold" : "forest"} className="shrink-0">
        {role}
      </Badge>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
