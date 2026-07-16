"use client";

import type { Address } from "viem";
import type { ReleaseFrequency } from "@/components/escrow";
import type { ConditionDeclaration } from "@/lib/condition";

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
  const res = await fetch(`/api/listings/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.listing ?? null;
}

export interface CreateListingInput {
  landlordEmail: string;
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
}

export async function createListing(input: CreateListingInput): Promise<Listing> {
  const res = await fetch("/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Could not create listing.");
  const json = await res.json();
  return json.listing;
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
