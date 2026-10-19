import { NextRequest, NextResponse } from "next/server";
import { recordDisputeRuling, getDisputeRulingsForLease } from "@/lib/disputeRulingServer";
import { isArbiterEmail } from "@/lib/leaseAccessServer";
import { errorResponse, HttpError, isMockMode, requireUser } from "@/lib/sessionServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const records = await getDisputeRulingsForLease(leaseId);
  return NextResponse.json({ records });
}

/** The arbiter's written reasoning for a ruling — only the arbiter can record one. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { leaseId, resolvedAt, reasoning } = await req.json();
    if (!leaseId || !resolvedAt || !reasoning) throw new HttpError("leaseId, resolvedAt, reasoning are required", 400);
    if (!isMockMode() && !(await isArbiterEmail(user.email))) {
      throw new HttpError("Only the arbiter can record a ruling.", 403);
    }
    const record = await recordDisputeRuling({ leaseId, resolvedAt, reasoning });
    return NextResponse.json({ record });
  } catch (error) {
    return errorResponse(error);
  }
}
