/**
 * Shared (server + browser) model for two-way lease reviews.
 *
 * Rules, enforced server-side in reviewServer.ts / reviewEligibilityServer.ts:
 *   - Only the real tenant or landlord of an on-chain lease can review the
 *     other party, once at least one rent period has been released (the
 *     tenant has actually moved in). One review per person per lease.
 *   - Double-blind: a review stays hidden until the other party has reviewed
 *     the same lease, or REVEAL_AFTER_MS has passed — so neither side can read
 *     the other's review before writing their own and retaliate.
 */

export const REVIEW_REVEAL_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
export const REVIEW_COMMENT_MAX = 1000;

export type ReviewRole = "tenant" | "landlord";

export interface Review {
  id: string;
  leaseId: string;
  fromEmail: string;
  /** Reviewer's display name, if they've set one on their profile. */
  fromName: string | null;
  fromPhotoUrl: string | null;
  toEmail: string;
  /** Which side of the lease the reviewee was on — null for legacy rows. */
  toRole: ReviewRole | null;
  rating: number;
  comment: string;
  createdAt: number;
  /** When the review became public; null while it's still hidden (double-blind). */
  publishedAt: number | null;
}

export interface RoleSummary {
  average: number;
  count: number;
  /** Counts of 1★ … 5★, index 0 = 1★. */
  distribution: [number, number, number, number, number];
}

export interface ReviewSummary {
  asLandlord: RoleSummary;
  asTenant: RoleSummary;
  /** True when the user has hidden reviews on their public profile. */
  hidden: boolean;
}

/**
 * When a review becomes public: the moment both sides had reviewed the lease,
 * or REVEAL_AFTER_MS after it was written — whichever comes first. null means
 * it's still hidden.
 */
export function publishedAtFor(createdAt: number, counterpartCreatedAt: number | null, now = Date.now()): number | null {
  if (counterpartCreatedAt !== null) return Math.max(createdAt, counterpartCreatedAt);
  const revealAt = createdAt + REVIEW_REVEAL_AFTER_MS;
  return now >= revealAt ? revealAt : null;
}

function emptyRoleSummary(): RoleSummary {
  return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
}

/** Per-role rating summary from a list of published reviews. */
export function summarizeReviews(reviews: Review[], hidden = false): ReviewSummary {
  const asLandlord = emptyRoleSummary();
  const asTenant = emptyRoleSummary();
  let landlordTotal = 0;
  let tenantTotal = 0;

  for (const r of reviews) {
    if (r.publishedAt === null) continue;
    // Legacy rows (no role) count towards neither side's role-specific score.
    if (r.toRole === "landlord") {
      asLandlord.count++;
      asLandlord.distribution[r.rating - 1]++;
      landlordTotal += r.rating;
    } else if (r.toRole === "tenant") {
      asTenant.count++;
      asTenant.distribution[r.rating - 1]++;
      tenantTotal += r.rating;
    }
  }

  asLandlord.average = asLandlord.count > 0 ? landlordTotal / asLandlord.count : 0;
  asTenant.average = asTenant.count > 0 ? tenantTotal / asTenant.count : 0;
  return { asLandlord, asTenant, hidden };
}

export const RATING_LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"] as const;
