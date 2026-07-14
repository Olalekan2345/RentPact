"use client";

import type { DisputeRulingRecord } from "@/lib/disputeRulingServer";

export type { DisputeRulingRecord };

export async function recordDisputeRuling(input: {
  leaseId: string;
  resolvedAt: number;
  reasoning: string;
}): Promise<void> {
  await fetch("/api/dispute-ruling", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchDisputeRulingsForLease(leaseId: string): Promise<DisputeRulingRecord[]> {
  const res = await fetch(`/api/dispute-ruling?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.records ?? [];
}
