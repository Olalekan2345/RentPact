"use client";

import type { Address } from "viem";
import { listLeasesForTenant, listLeasesForLandlord, type Lease } from "@/lib/leaseData";
import { fetchActivityFeed } from "@/lib/activityEventStore";
import { SETTLEMENT_WINDOW_MS, ARBITRATION_WINDOW_MS } from "@/lib/constitution";

export type DisputeTier = "tier0" | "settlement" | "arbitration" | "overdue";

export interface ActiveDisputeSummary {
  lease: Lease;
  role: "tenant" | "landlord";
  frozenAmount: number;
  tier: DisputeTier;
  raisedAt: number;
  settlementDeadline: number;
  arbitrationDeadline: number;
}

export interface ResolvedDisputeSummary {
  lease: Lease;
  role: "tenant" | "landlord";
  raisedAt: number;
  resolvedAt: number;
  landlordBps: number;
  resolutionType: "settlement" | "arbitration" | "auto-fallback";
}

export interface DisputeOverview {
  active: ActiveDisputeSummary[];
  resolved: ResolvedDisputeSummary[];
  frozenTotal: number;
  avgResolutionMs: number | null;
}

export function disputeTier(raisedAt: number, now = Date.now()): DisputeTier {
  const settlementDeadline = raisedAt + SETTLEMENT_WINDOW_MS;
  const arbitrationDeadline = settlementDeadline + ARBITRATION_WINDOW_MS;
  if (now <= settlementDeadline) return "settlement";
  if (now <= arbitrationDeadline) return "arbitration";
  return "overdue";
}

export async function getDisputeOverview(params: { email: string; address: Address }): Promise<DisputeOverview> {
  // false: active-dispute state (disputeActive/disputeRaisedAt) comes
  // straight off the lease regardless — no need to pay for the per-lease
  // history scan here. Resolution history for the "resolved" tab comes from
  // activity_events below instead (see migration 0007).
  const [tenantLeases, landlordLeases, activity] = await Promise.all([
    listLeasesForTenant(params, false),
    listLeasesForLandlord(params, false),
    fetchActivityFeed(params.address, 1000),
  ]);

  const withRole: { lease: Lease; role: "tenant" | "landlord" }[] = [
    ...tenantLeases.map((lease) => ({ lease, role: "tenant" as const })),
    ...landlordLeases.map((lease) => ({ lease, role: "landlord" as const })),
  ];

  const activityByLease = new Map<string, typeof activity>();
  for (const item of activity) {
    const list = activityByLease.get(item.leaseId);
    if (list) list.push(item);
    else activityByLease.set(item.leaseId, [item]);
  }

  const active: ActiveDisputeSummary[] = [];
  const resolved: ResolvedDisputeSummary[] = [];

  for (const { lease, role } of withRole) {
    if (lease.disputeActive && lease.disputeRaisedAt) {
      const raisedAt = lease.disputeRaisedAt;
      active.push({
        lease,
        role,
        frozenAmount: lease.amountPerPeriod * (lease.totalPeriods - lease.periodsReleased),
        tier: disputeTier(raisedAt),
        raisedAt,
        settlementDeadline: raisedAt + SETTLEMENT_WINDOW_MS,
        arbitrationDeadline: raisedAt + SETTLEMENT_WINDOW_MS + ARBITRATION_WINDOW_MS,
      });
    }

    // A lease's dispute cycles never overlap (the contract won't let a new
    // dispute be raised while one is active), so pairing raised/resolved
    // events for the same lease in chronological order is exact, not a guess.
    const leaseActivity = (activityByLease.get(lease.id) ?? []).slice().sort((a, b) => a.timestamp - b.timestamp);
    const raisedEvents = leaseActivity.filter((e) => e.type === "dispute-raised");
    const resolvedEvents = leaseActivity.filter(
      (e) => e.type === "dispute-resolved" || e.type === "caution-claim-resolved",
    );
    resolvedEvents.forEach((r, i) => {
      resolved.push({
        lease,
        role,
        raisedAt: raisedEvents[i]?.timestamp ?? r.timestamp,
        resolvedAt: r.timestamp,
        landlordBps: r.landlordBps ?? 0,
        resolutionType: r.resolutionType ?? "arbitration",
      });
    });
  }

  resolved.sort((a, b) => b.resolvedAt - a.resolvedAt);

  const frozenTotal = active.reduce((sum, d) => sum + d.frozenAmount, 0);
  const avgResolutionMs =
    resolved.length > 0
      ? resolved.reduce((sum, r) => sum + (r.resolvedAt - r.raisedAt), 0) / resolved.length
      : null;

  return { active, resolved, frozenTotal, avgResolutionMs };
}
