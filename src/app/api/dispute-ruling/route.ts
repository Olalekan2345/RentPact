import { NextRequest, NextResponse } from "next/server";
import { recordDisputeRuling, getDisputeRulingsForLease } from "@/lib/disputeRulingServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const records = await getDisputeRulingsForLease(leaseId);
  return NextResponse.json({ records });
}

export async function POST(req: NextRequest) {
  const { leaseId, resolvedAt, reasoning } = await req.json();
  if (!leaseId || !resolvedAt || !reasoning) {
    return NextResponse.json({ error: "leaseId, resolvedAt, reasoning are required" }, { status: 400 });
  }
  const record = await recordDisputeRuling({ leaseId, resolvedAt, reasoning });
  return NextResponse.json({ record });
}
