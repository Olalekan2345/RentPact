import { NextRequest, NextResponse } from "next/server";
import { getMoveOutCondition, createMoveOutCondition } from "@/lib/moveOutServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const record = await getMoveOutCondition(leaseId);
  return NextResponse.json({ record });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leaseId, submittedBy, notes, photos, declaredAt, hash } = body;
    if (!leaseId || !submittedBy || !declaredAt || !hash) {
      return NextResponse.json({ error: "leaseId, submittedBy, declaredAt, hash are required" }, { status: 400 });
    }
    const record = await createMoveOutCondition({
      leaseId,
      submittedBy: submittedBy.trim().toLowerCase(),
      notes: notes ?? "",
      photos: photos ?? [],
      declaredAt,
      hash,
    });
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}
