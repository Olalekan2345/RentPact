import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * RentPactEscrow.sol has no concept of a property address, photo, or email —
 * only wallet addresses and USDC amounts. This table holds that display
 * metadata, keyed by the real on-chain leaseId, visible to both parties
 * regardless of which browser/device created or signed the lease.
 *
 * tenantAddress/landlordAddress double as a lookup index (see
 * findLeaseIdsForAddress below) — "which leases is this wallet part of"
 * becomes a database query instead of a full blockchain event-log scan.
 * The chain remains the source of truth for each lease's financial state;
 * this only accelerates discovering which lease IDs to read.
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

function fromRow(row: {
  property_address: string;
  property_type: string;
  photo_url: string | null;
  tenant_email: string;
  landlord_email: string;
  tenant_address: string | null;
  landlord_address: string | null;
}): LeaseMetadata {
  return {
    propertyAddress: row.property_address,
    propertyType: row.property_type,
    photoUrl: row.photo_url,
    tenantEmail: row.tenant_email,
    landlordEmail: row.landlord_email,
    tenantAddress: row.tenant_address ?? "",
    landlordAddress: row.landlord_address ?? "",
  };
}

export async function saveLeaseMetadata(leaseId: string, metadata: LeaseMetadata): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("lease_metadata")
    .upsert(
      {
        lease_id: leaseId,
        property_address: metadata.propertyAddress,
        property_type: metadata.propertyType,
        photo_url: metadata.photoUrl,
        tenant_email: metadata.tenantEmail.trim().toLowerCase(),
        landlord_email: metadata.landlordEmail.trim().toLowerCase(),
        tenant_address: metadata.tenantAddress.trim().toLowerCase(),
        landlord_address: metadata.landlordAddress.trim().toLowerCase(),
      },
      { onConflict: "lease_id" },
    );
  if (error) throw error;
}

export async function getLeaseMetadata(leaseId: string): Promise<LeaseMetadata | null> {
  const { data } = await supabaseAdmin().from("lease_metadata").select().eq("lease_id", leaseId).maybeSingle();
  return data ? fromRow(data) : null;
}

/** Fast path for "which leases is this wallet part of" — see module docstring. */
export async function findLeaseIdsForAddress(address: string, role: "tenant" | "landlord"): Promise<string[]> {
  const normalized = address.trim().toLowerCase();
  const column = role === "tenant" ? "tenant_address" : "landlord_address";
  const { data } = await supabaseAdmin().from("lease_metadata").select("lease_id").eq(column, normalized);
  return (data ?? []).map((row) => row.lease_id);
}
