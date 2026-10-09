import { NextRequest, NextResponse } from "next/server";
import { listPublishedReviewsForEmail, hasReviewed, createReview, getLeaseReviewState } from "@/lib/reviewServer";
import { checkReviewEligibility, requireSessionEmail, ReviewAccessError } from "@/lib/reviewEligibilityServer";
import { REVIEW_COMMENT_MAX } from "@/lib/reviewModel";

/** Published reviews about a user — hidden (double-blind) reviews are never returned. */
export async function GET(req: NextRequest) {
  const forEmail = req.nextUrl.searchParams.get("forEmail");
  if (!forEmail) return NextResponse.json({ error: "forEmail query param is required" }, { status: 400 });
  const reviews = await listPublishedReviewsForEmail(forEmail);
  return NextResponse.json({ reviews });
}

/**
 * Leave a review of the other party of a lease. The reviewer is the signed-in
 * user and the reviewee is derived from the lease — any from/to emails in the
 * body are ignored (outside mock mode), so nobody can review as someone else.
 */
export async function POST(req: NextRequest) {
  try {
    const email = await requireSessionEmail();
    const body = await req.json().catch(() => ({}));
    const { leaseId, rating, comment, toEmail, toRole } = body as Record<string, unknown>;

    if (typeof leaseId !== "string" || !leaseId) {
      return NextResponse.json({ error: "leaseId is required" }, { status: 400 });
    }
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
    }
    const text = typeof comment === "string" ? comment.trim() : "";
    if (text.length > REVIEW_COMMENT_MAX) {
      return NextResponse.json({ error: `Keep your review under ${REVIEW_COMMENT_MAX} characters.` }, { status: 400 });
    }

    const { revieweeEmail, revieweeRole } = await checkReviewEligibility(leaseId, email, { toEmail, toRole });

    if (await hasReviewed(leaseId, email)) {
      return NextResponse.json({ error: "You've already reviewed this lease." }, { status: 409 });
    }

    await createReview({ leaseId, fromEmail: email, toEmail: revieweeEmail, toRole: revieweeRole, rating, comment: text });
    return NextResponse.json({ state: await getLeaseReviewState(leaseId, email) });
  } catch (error) {
    if (error instanceof ReviewAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // A concurrent duplicate submit trips the (lease_id, from_email) unique index.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "You've already reviewed this lease." }, { status: 409 });
    }
    console.error("[reviews] create failed", error);
    return NextResponse.json({ error: "Could not submit your review. Please try again." }, { status: 500 });
  }
}
