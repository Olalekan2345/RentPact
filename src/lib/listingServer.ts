import "server-only";
import type { Address } from "viem";
import type { ReleaseFrequency } from "@/components/escrow";
import type { ConditionDeclaration } from "@/lib/condition";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profileServer";
import { PUBLIC_LISTING_STATUSES, approvedLandlords } from "@/lib/verificationServer";
import type { ListingVerificationStatus } from "@/lib/verificationModel";

/**
 * Server-side property listing store, backed by Postgres (Supabase).
 * Listings need to be visible to any tenant browsing from any device —
 * localStorage can't do that (it's per-browser).
 */

export interface Listing {
  id: string;
  landlordEmail: string;
  landlordAddress: Address;
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  amountPerPeriod: number;
  totalPeriods: number;
  frequency: ReleaseFrequency;
  createdAt: number;
  /** False once a tenant has deposited into escrow for this listing. */
  active: boolean;
  /** Landlord's declared property condition at listing time — see lib/condition.ts. */
  condition: ConditionDeclaration | null;
  amenities: string[];
  /**
   * Optional security deposit, tracked off-chain as a labeled portion of the
   * total deposit — the contract has no separate security-deposit pool, so
   * this is a convention the landlord manually honors on move-out, not a
   * contract-enforced escrow split.
   */
  securityDeposit: number | null;
  houseRules: string;
  noticePeriodDays: number | null;
  /** RentPact's review of this property — see verificationServer.ts. */
  verificationStatus: ListingVerificationStatus;
  verifiedAt: number | null;
  /** Whether the landlord's own identity has been verified (filled in by the list/get helpers). */
  landlordVerified: boolean;
}

/** Fields a landlord supplies; the rest is set by the server. */
export type NewListing = Omit<Listing, "id" | "createdAt" | "active" | "verificationStatus" | "verifiedAt" | "landlordVerified">;

function fromRow(row: {
  id: string;
  landlord_email: string;
  landlord_address: string | null;
  property_address: string;
  property_type: string;
  photo_url: string | null;
  amount_per_period: number;
  total_periods: number;
  frequency: string;
  created_at: number;
  active: boolean;
  condition: unknown;
  amenities: string[];
  security_deposit: number | null;
  house_rules: string;
  notice_period_days: number | null;
  verification_status?: string | null;
  verified_at?: number | null;
}): Listing {
  return {
    id: row.id,
    landlordEmail: row.landlord_email,
    landlordAddress: (row.landlord_address ?? "0x") as Address,
    propertyAddress: row.property_address,
    propertyType: row.property_type,
    photoUrl: row.photo_url,
    amountPerPeriod: row.amount_per_period,
    totalPeriods: row.total_periods,
    frequency: row.frequency as ReleaseFrequency,
    createdAt: row.created_at,
    active: row.active,
    condition: row.condition as ConditionDeclaration | null,
    amenities: row.amenities,
    securityDeposit: row.security_deposit,
    houseRules: row.house_rules,
    noticePeriodDays: row.notice_period_days,
    verificationStatus: (row.verification_status as ListingVerificationStatus | null) ?? "unverified",
    verifiedAt: row.verified_at ?? null,
    landlordVerified: false,
  };
}

async function withLandlordVerification(listings: Listing[]): Promise<Listing[]> {
  const approved = await approvedLandlords(listings.map((l) => l.landlordEmail));
  return listings.map((l) => ({ ...l, landlordVerified: approved.has(l.landlordEmail) }));
}

/** What tenants can browse: live listings that are verified, or were published before verification existed. */
export async function listActiveListings(): Promise<Listing[]> {
  const { data } = await supabaseAdmin()
    .from("listings")
    .select()
    .eq("active", true)
    .in("verification_status", PUBLIC_LISTING_STATUSES)
    .order("created_at", { ascending: false });
  return withLandlordVerification((data ?? []).map(fromRow));
}

/** Any listing, whatever its status — callers decide who may see a pending or rejected one. */
export async function getListing(id: string): Promise<Listing | null> {
  const { data } = await supabaseAdmin().from("listings").select().eq("id", id).maybeSingle();
  return data ? (await withLandlordVerification([fromRow(data)]))[0] : null;
}

export async function createListing(
  input: NewListing,
  verificationStatus: Extract<ListingVerificationStatus, "pending" | "approved">,
): Promise<Listing> {
  await ensureProfile(input.landlordEmail);

  const listing: Listing = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    active: true,
    verificationStatus,
    verifiedAt: null,
    landlordVerified: true,
  };

  const { error } = await supabaseAdmin()
    .from("listings")
    .insert({
      id: listing.id,
      landlord_email: listing.landlordEmail.trim().toLowerCase(),
      landlord_address: listing.landlordAddress,
      property_address: listing.propertyAddress,
      property_type: listing.propertyType,
      photo_url: listing.photoUrl,
      amount_per_period: listing.amountPerPeriod,
      total_periods: listing.totalPeriods,
      frequency: listing.frequency,
      created_at: listing.createdAt,
      active: listing.active,
      condition: listing.condition,
      amenities: listing.amenities,
      security_deposit: listing.securityDeposit,
      house_rules: listing.houseRules,
      notice_period_days: listing.noticePeriodDays,
      verification_status: verificationStatus,
    });
  if (error) throw error;

  return listing;
}

export async function deactivateListing(id: string): Promise<void> {
  await supabaseAdmin().from("listings").update({ active: false }).eq("id", id);
}

/**
 * Atomically claims a listing for the caller about to fund escrow, closing
 * the race where two tenants both start paying for the same property before
 * either's deposit lands. The `.eq("active", true)` predicate means only one
 * concurrent request can actually flip a row — Postgres serializes the
 * update, so a second caller sees zero rows affected and gets `false`.
 * Returns whether *this* call was the one that claimed it. Only listings tenants can see may be claimed,
 * and the claim records who made it, so only that tenant can release it again.
 */
export async function reserveListing(id: string, tenantEmail: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .update({ active: false, reserved_by: tenantEmail })
    .eq("id", id)
    .eq("active", true)
    .in("verification_status", PUBLIC_LISTING_STATUSES)
    .neq("landlord_email", tenantEmail)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Rolls back a reserveListing() claim when the deposit that followed it failed — only by the tenant who made it. */
export async function reactivateListing(id: string, tenantEmail: string): Promise<void> {
  await supabaseAdmin()
    .from("listings")
    .update({ active: true, reserved_by: null })
    .eq("id", id)
    .eq("reserved_by", tenantEmail);
}

/** A landlord's listings. `includePrivate` (the landlord themselves) adds pending and rejected ones. */
export async function listListingsForLandlord(landlordEmail: string, includePrivate = false): Promise<Listing[]> {
  const normalized = landlordEmail.trim().toLowerCase();
  let query = supabaseAdmin().from("listings").select().eq("landlord_email", normalized);
  if (!includePrivate) query = query.in("verification_status", PUBLIC_LISTING_STATUSES);
  const { data } = await query.order("created_at", { ascending: false });
  return withLandlordVerification((data ?? []).map(fromRow));
}

export async function deactivateAllListingsForLandlord(landlordEmail: string): Promise<void> {
  const normalized = landlordEmail.trim().toLowerCase();
  await supabaseAdmin()
    .from("listings")
    .update({ active: false })
    .eq("landlord_email", normalized)
    .eq("active", true);
}
