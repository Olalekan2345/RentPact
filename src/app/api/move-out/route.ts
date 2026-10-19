import { NextRequest, NextResponse } from "next/server";
import { getMoveOutCondition, createMoveOutCondition } from "@/lib/moveOutServer";
import { requireLeaseAccess } from "@/lib/leaseAccessServer";
import { errorResponse, HttpError, requireSelf, requireUser } from "@/lib/sessionServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const record = await getMoveOutCondition(leaseId);
  return NextResponse.json({ record });
}

/** A move-out condition report, filed by one of the lease's parties in their own name. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { leaseId, submittedBy, notes, photos, declaredAt, hash } = body;
    if (!leaseId || !submittedBy || !declaredAt || !hash) {
      throw new HttpError("leaseId, submittedBy, declaredAt, hash are required", 400);
    }
    const submitter = await requireSelf(submittedBy);
    await requireLeaseAccess(String(leaseId), user);
    try {
      const record = await createMoveOutCondition({
        leaseId,
        submittedBy: submitter,
        notes: notes ?? "",
        photos: photos ?? [],
        declaredAt,
        hash,
      });
      return NextResponse.json({ record });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
