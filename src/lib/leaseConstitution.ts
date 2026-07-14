"use client";

export interface LeaseConstitutionRecord {
  leaseId: string;
  version: string;
  hash: string;
  acceptedAt: number;
}

export async function recordLeaseConstitution(input: LeaseConstitutionRecord): Promise<void> {
  await fetch("/api/lease-constitution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchLeaseConstitution(leaseId: string): Promise<LeaseConstitutionRecord | null> {
  const res = await fetch(`/api/lease-constitution?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.record ?? null;
}
