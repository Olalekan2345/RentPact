import type { EscrowTimelineNodeData } from "@/components/escrow";
import { INTERVAL_DAYS } from "@/lib/contracts/frequency";
import type { Lease } from "@/lib/leaseData";

export function nodesForLease(lease: Lease): EscrowTimelineNodeData[] {
  const intervalMs = INTERVAL_DAYS[lease.frequency] * 24 * 60 * 60 * 1000;
  const anchor = lease.signedAt ?? lease.createdAt;

  return Array.from({ length: lease.totalPeriods }, (_, i) => {
    const period = i + 1;
    const isFrozenPeriod = lease.disputeActive && period === lease.periodsReleased + 1;
    const status = isFrozenPeriod ? "frozen" : period <= lease.periodsReleased ? "released" : "upcoming";

    return {
      period,
      status,
      releaseDate: new Date(anchor + i * intervalMs),
      amount: lease.amountPerPeriod,
    };
  });
}
