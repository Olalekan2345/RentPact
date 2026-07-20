export type ActivityType =
  | "deposit"
  | "signed"
  | "release"
  | "dispute-raised"
  | "dispute-resolved"
  | "caution-claim-filed"
  | "caution-released"
  | "caution-claim-resolved";

export type ResolutionType = "settlement" | "arbitration" | "auto-fallback";

export interface ActivityEvent {
  id: string;
  leaseId: string;
  type: ActivityType;
  timestamp: number;
  amount: number | null;
  txHash: string | null;
  /** Only set for dispute-resolved/caution-claim-resolved rows. */
  landlordBps?: number | null;
  resolutionType?: ResolutionType | null;
}

/** Fire-and-forget from leaseData.ts right after a mutation lands — see activityEventServer.ts. */
export async function recordActivityEvent(event: ActivityEvent): Promise<void> {
  await fetch("/api/activity-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

export async function fetchActivityFeed(address: string, limit: number): Promise<ActivityEvent[]> {
  const res = await fetch(`/api/activity-events?address=${encodeURIComponent(address)}&limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.events ?? [];
}

/** All recorded events for one lease — used by the dispute panel, which already knows the leaseId from the URL. */
export async function fetchActivityFeedForLease(leaseId: string): Promise<ActivityEvent[]> {
  const res = await fetch(`/api/activity-events?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.events ?? [];
}
