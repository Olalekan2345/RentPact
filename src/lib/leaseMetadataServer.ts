import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * RentPactEscrow.sol has no concept of a property address, photo, or email —
 * only wallet addresses and USDC amounts. This table holds that display
 * metadata, keyed by the real on-chain leaseId, visible to both parties
 * regardless of which browser/device created or signed the lease.
 */
export interface LeaseMetadata {
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  tenantEmail: string;
  landlordEmail: string;
}

function fromRow(row: {
  property_address: string;
  property_type: string;
  photo_url: string | null;
  tenant_email: string;
  landlord_email: string;
}): LeaseMetadata {
  return {
    propertyAddress: row.property_address,
    propertyType: row.property_type,
    photoUrl: row.photo_url,
    tenantEmail: row.tenant_email,
    landlordEmail: row.landlord_email,
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
      },
      { onConflict: "lease_id" },
    );
  if (error) throw error;
}

export async function getLeaseMetadata(leaseId: string): Promise<LeaseMetadata | null> {
  const { data } = await supabaseAdmin().from("lease_metadata").select().eq("lease_id", leaseId).maybeSingle();
  return data ? fromRow(data) : null;
}
