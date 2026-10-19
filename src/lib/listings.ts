"use client";

import type { Address } from "viem";
import type { ReleaseFrequency } from "@/components/escrow";
import type { ConditionDeclaration } from "@/lib/condition";
import type { ListingVerificationStatus, ListingVerificationSummary, VerificationDocument } from "@/lib/verificationModel";

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
  active: boolean;
  condition: ConditionDeclaration | null;
  amenities: string[];
  securityDeposit: number | null;
  houseRules: string;
  noticePeriodDays: number | null;
  verificationStatus: ListingVerificationStatus;
  verifiedAt: number | null;
  landlordVerified: boolean;
}

export async function fetchActiveListings(): Promise<Listing[]> {
  const res = await fetch("/api/listings");
  if (!res.ok) return [];
  const json = await res.json();
  return json.listings ?? [];
}

export async function fetchListingsForLandlord(landlordEmail: string): Promise<Listing[]> {
  const res = await fetch(`/api/listings?landlordEmail=${encodeURIComponent(landlordEmail)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.listings ?? [];
}

export async function fetchListing(id: string): Promise<Listing | null> {
  return (await fetchListingWithVerification(id))?.listing ?? null;
}

export async function fetchListingWithVerification(
  id: string,
): Promise<{ listing: Listing; verification: ListingVerificationSummary } | null> {
  const res = await fetch(`/api/listings/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.listing ? { listing: json.listing, verification: json.verification } : null;
}

/** The property's ownership documents, sent with a new listing for RentPact to check. */
export interface PropertyDocuments {
  titleDocumentType: string;
  documents: VerificationDocument[];
}

export interface CreateListingInput {
  landlordAddress: Address;
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  amountPerPeriod: number;
  totalPeriods: number;
  frequency: ReleaseFrequency;
  condition: ConditionDeclaration | null;
  amenities: string[];
  securityDeposit: number | null;
  houseRules: string;
  noticePeriodDays: number | null;
  /** "List again": keeps an approved property's verification if the address hasn't changed. */
  relistOf?: string;
}

/**
 * Publishes a listing for the signed-in landlord (the server takes who they are from the session).
 * `needsDocuments` means a re-list couldn't keep its old approval and must be sent with documents.
 */
export async function createListing(
  input: CreateListingInput & Partial<PropertyDocuments>,
): Promise<{ listing: Listing; needsDocuments: boolean }> {
  const res = await fetch("/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Could not create listing.");
  return { listing: json.listing, needsDocuments: json.needsDocuments === true };
}

/** Sends one of your own listings for verification with its documents. */
export async function submitListingDocuments(id: string, docs: PropertyDocuments): Promise<void> {
  const res = await fetch(`/api/listings/${id}/verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(docs),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not send the documents.");
}

export async function reportListing(id: string, reason: string): Promise<void> {
  const res = await fetch(`/api/listings/${id}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not send the report.");
}

export async function deactivateListing(id: string): Promise<void> {
  await fetch(`/api/listings/${id}`, { method: "PATCH" });
}

/** Atomically claims a listing before funding escrow. Returns false if another tenant already claimed it. */
export async function reserveListing(id: string): Promise<boolean> {
  const res = await fetch(`/api/listings/${id}/reserve`, { method: "POST" });
  if (!res.ok) return false;
  const json = await res.json();
  return json.reserved === true;
}

/** Rolls back a reserveListing() claim when the deposit that followed it failed. */
export async function reactivateListing(id: string): Promise<void> {
  await fetch(`/api/listings/${id}/reserve`, { method: "DELETE" });
}

export async function linkLeaseToListing(leaseId: string, listingId: string): Promise<void> {
  await fetch("/api/lease-listing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaseId, listingId }),
  });
}

export async function fetchListingIdForLease(leaseId: string): Promise<string | null> {
  const res = await fetch(`/api/lease-listing?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.listingId ?? null;
}
