import { NextRequest, NextResponse } from "next/server";
import { getLeaseReviewState } from "@/lib/reviewServer";
import { requireSessionEmail, ReviewAccessError } from "@/lib/reviewEligibilityServer";

/**
 * The signed-in viewer's review state for one lease: their own review (always
 * visible to them), the other party's review once published, and whether the
 * other party has reviewed yet (a nudge — never the hidden content).
 */
export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  try {
    const email = await requireSessionEmail();
    return NextResponse.json({ state: await getLeaseReviewState(leaseId, email) });
  } catch (error) {
    if (error instanceof ReviewAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not load reviews for this lease." }, { status: 500 });
  }
}
