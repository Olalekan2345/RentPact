import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Records which listing a lease was created from, so the lease detail page
 * can still show the landlord's property condition declaration after the
 * listing itself has been deactivated (a lease is created, then its
 * listing is immediately deactivated so it stops showing up for other
 * tenants — the declaration must stay reachable regardless).
 */

export async function linkLeaseToListing(leaseId: string, listingId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("lease_listing_links").select("lease_id").eq("lease_id", leaseId).maybeSingle();
  if (existing) return;
  const { error } = await db.from("lease_listing_links").insert({ lease_id: leaseId, listing_id: listingId });
  if (error) throw error;
}

export async function getListingIdForLease(leaseId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("lease_listing_links")
    .select("listing_id")
    .eq("lease_id", leaseId)
    .maybeSingle();
  return data?.listing_id ?? null;
}
