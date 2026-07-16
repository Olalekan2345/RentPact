/**
 * RentPactEscrow.sol has no concept of a property address, photo, or email —
 * only wallet addresses and USDC amounts. This display metadata lives in
 * Postgres (via /api/lease-metadata), keyed by the real on-chain leaseId, so
 * both parties see it regardless of which browser/device created or signed
 * the lease. Financial state (amounts, periods, signed/dispute status)
 * always comes from the contract directly — never from here.
 */

export interface LeaseMetadata {
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  tenantEmail: string;
  landlordEmail: string;
  tenantAddress: string;
  landlordAddress: string;
}

export async function saveLeaseMetadata(leaseId: string, metadata: LeaseMetadata): Promise<void> {
  await fetch("/api/lease-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaseId, ...metadata }),
  });
}

export async function getLeaseMetadata(leaseId: string): Promise<LeaseMetadata | null> {
  const res = await fetch(`/api/lease-metadata?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.metadata ?? null;
}

/** Fast path for "which leases is this wallet part of" — a Postgres lookup instead of a full blockchain event scan. */
export async function findLeaseIdsForAddress(address: string, role: "tenant" | "landlord"): Promise<string[]> {
  const res = await fetch(`/api/lease-metadata/by-address?address=${encodeURIComponent(address)}&role=${role}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.leaseIds ?? [];
}
