import { NextRequest, NextResponse } from "next/server";
import { listReviewsForEmail, hasReviewed, createReview } from "@/lib/reviewServer";
import { readLease } from "@/lib/contracts/onChainLease";
import { envResult } from "@/lib/env";

export async function GET(req: NextRequest) {
  const forEmail = req.nextUrl.searchParams.get("forEmail");
  if (!forEmail) return NextResponse.json({ error: "forEmail query param is required" }, { status: 400 });
  const reviews = await listReviewsForEmail(forEmail);
  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  try {
    const { leaseId, fromEmail, toEmail, rating, comment } = await req.json();

    if (!leaseId || !fromEmail || !toEmail || !rating) {
      return NextResponse.json({ error: "leaseId, fromEmail, toEmail, rating are required" }, { status: 400 });
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be between 1 and 5" }, { status: 400 });
    }
    if (await hasReviewed(leaseId, fromEmail)) {
      return NextResponse.json({ error: "You've already reviewed this lease." }, { status: 409 });
    }

    // Real mode: verify the lease is genuinely completed on-chain before
    // accepting a review — reviews only unlock after the lease is done.
    const mockMode = envResult.success ? envResult.env.NEXT_PUBLIC_MOCK_MODE : true;
    if (!mockMode) {
      const lease = await readLease(BigInt(leaseId));
      if (lease.cancelled || lease.periodsReleased < lease.totalPeriods) {
        return NextResponse.json({ error: "This lease isn't completed yet." }, { status: 403 });
      }
    }

    const review = await createReview({ leaseId, fromEmail, toEmail, rating, comment: comment ?? "" });
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
