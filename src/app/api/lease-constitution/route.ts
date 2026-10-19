import { NextRequest, NextResponse } from "next/server";
import { recordLeaseConstitution, getLeaseConstitution } from "@/lib/leaseConstitutionServer";
import { requireLeaseAccess } from "@/lib/leaseAccessServer";
import { errorResponse, HttpError, requireUser } from "@/lib/sessionServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const record = await getLeaseConstitution(leaseId);
  return NextResponse.json({ record });
}

/** Records which Constitution version a lease's parties accepted — by one of those parties. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { leaseId, version, hash, acceptedAt } = await req.json();
    if (!leaseId || !version || !hash || !acceptedAt) {
      throw new HttpError("leaseId, version, hash, acceptedAt are required", 400);
    }
    await requireLeaseAccess(String(leaseId), user);
    await recordLeaseConstitution({ leaseId, version, hash, acceptedAt });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
