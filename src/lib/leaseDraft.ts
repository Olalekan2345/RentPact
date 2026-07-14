import type { Address } from "viem";
import type { ReleaseFrequency } from "@/components/escrow";

/**
 * Terms for a lease that's about to be funded, staged in sessionStorage
 * between picking a listing and completing the deposit. Built directly from
 * a Listing (see lib/listings.ts) — the landlord's real wallet address is
 * always known up front since they published the listing after signing up.
 */
export interface LeaseDraft {
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  landlordEmail: string;
  landlordAddress: Address | null;
  amountPerPeriod: number;
  totalPeriods: number;
  frequency: ReleaseFrequency;
  /** From the listing's securityDeposit, if any (Article 1.6) — 0 for none. */
  cautionAmount: number;
}
