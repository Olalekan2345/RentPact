import "server-only";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";
import { getLeaseMetadata } from "@/lib/leaseMetadataServer";
import { readLease } from "@/lib/contracts/onChainLease";
import { isMockMode, walletAddressesFor } from "@/lib/sessionServer";
import type { ReviewRole } from "@/lib/reviewModel";

/**
 * Who may review whom. Reviews are reputation — the trust signal renters and
 * landlords decide on — so a review must come from the genuine counterparty
 * of a real lease, never from whatever emails a request body claims:
 *
 *   1. The reviewer is the signed-in user, read from their Supabase session
 *      cookie (requireSessionEmail), not from the request.
 *   2. They must be the tenant or landlord recorded for the lease, and the
 *      reviewee is always the *other* party.
 *   3. Real mode only: at least one rent period has been released on-chain
 *      (the tenant actually moved in), and BOTH people's Circle wallets must
 *      be the on-chain tenant/landlord — so a tampered lease_metadata row
 *      can't attribute a review to, or aim it at, the wrong person.
 */

export class ReviewAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The caller's email, verified from their Supabase session cookie. */
export async function requireSessionEmail(): Promise<string> {
  let email: string | undefined;
  try {
    const {
      data: { user },
    } = await supabaseRouteHandler().auth.getUser();
    email = user?.email?.trim().toLowerCase();
  } catch {
    email = undefined;
  }
  if (!email) throw new ReviewAccessError("Please sign in again to continue.", 401);
  return email;
}

export interface ReviewEligibility {
  revieweeEmail: string;
  revieweeRole: ReviewRole;
}

/**
 * Resolves the reviewee for `reviewerEmail` on `leaseId`, or throws
 * ReviewAccessError explaining why they can't review it.
 *
 * `mockFallback` is honoured ONLY in mock mode, where leases live in the
 * browser and the server has no record of their parties.
 */
export async function checkReviewEligibility(
  leaseId: string,
  reviewerEmail: string,
  mockFallback?: { toEmail?: unknown; toRole?: unknown },
): Promise<ReviewEligibility> {
  if (isMockMode()) {
    const toEmail = typeof mockFallback?.toEmail === "string" ? mockFallback.toEmail.trim().toLowerCase() : "";
    const toRole = mockFallback?.toRole;
    if (!toEmail || (toRole !== "tenant" && toRole !== "landlord")) {
      throw new ReviewAccessError("toEmail and toRole are required in mock mode.", 400);
    }
    if (toEmail === reviewerEmail) throw new ReviewAccessError("You can't review yourself.", 403);
    return { revieweeEmail: toEmail, revieweeRole: toRole };
  }

  if (!/^\d+$/.test(leaseId)) throw new ReviewAccessError("Invalid lease.", 400);

  const metadata = await getLeaseMetadata(leaseId);
  if (!metadata) throw new ReviewAccessError("Lease not found.", 404);

  const tenantEmail = metadata.tenantEmail.trim().toLowerCase();
  const landlordEmail = metadata.landlordEmail.trim().toLowerCase();
  if (tenantEmail === landlordEmail) throw new ReviewAccessError("You can't review yourself.", 403);

  const reviewerRole: ReviewRole | null =
    reviewerEmail === tenantEmail ? "tenant" : reviewerEmail === landlordEmail ? "landlord" : null;
  if (!reviewerRole) {
    throw new ReviewAccessError("Only the tenant and landlord of this lease can review it.", 403);
  }
  const revieweeRole: ReviewRole = reviewerRole === "tenant" ? "landlord" : "tenant";
  const revieweeEmail = reviewerRole === "tenant" ? landlordEmail : tenantEmail;

  const onChain = await readLease(BigInt(leaseId));
  if (onChain.periodsReleased < 1) {
    throw new ReviewAccessError("Reviews unlock once the first rent period has been released.", 403);
  }

  const onChainParty: Record<ReviewRole, string> = {
    tenant: onChain.tenant.toLowerCase(),
    landlord: onChain.landlord.toLowerCase(),
  };
  const [reviewerWallets, revieweeWallets] = await Promise.all([
    walletAddressesFor(reviewerEmail),
    walletAddressesFor(revieweeEmail),
  ]);
  if (!reviewerWallets.includes(onChainParty[reviewerRole]) || !revieweeWallets.includes(onChainParty[revieweeRole])) {
    throw new ReviewAccessError("We couldn't verify both parties of this lease on-chain.", 403);
  }

  return { revieweeEmail, revieweeRole };
}
