"use client";

import type { Address } from "viem";
import { listLeasesForTenant, listLeasesForLandlord, type Lease } from "@/lib/leaseData";
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
  // true: the "resolved" tab below reads lease.resolvedDisputes, which only
  // the historical event scan populates.
  const [tenantLeases, landlordLeases] = await Promise.all([
    listLeasesForTenant(params, true),
    listLeasesForLandlord(params, true),
  ]);

  const withRole: { lease: Lease; role: "tenant" | "landlord" }[] = [
    ...tenantLeases.map((lease) => ({ lease, role: "tenant" as const })),
    ...landlordLeases.map((lease) => ({ lease, role: "landlord" as const })),
  ];

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
    for (const r of lease.resolvedDisputes) {
      resolved.push({
        lease,
        role,
        raisedAt: r.raisedAt,
        resolvedAt: r.resolvedAt,
        landlordBps: r.landlordBps,
        resolutionType: r.resolutionType,
      });
    }
  }

  resolved.sort((a, b) => b.resolvedAt - a.resolvedAt);

  const frozenTotal = active.reduce((sum, d) => sum + d.frozenAmount, 0);
  const avgResolutionMs =
    resolved.length > 0
      ? resolved.reduce((sum, r) => sum + (r.resolvedAt - r.raisedAt), 0) / resolved.length
      : null;

  return { active, resolved, frozenTotal, avgResolutionMs };
}
