import { NextRequest, NextResponse } from "next/server";
import { migrateListingThreadToLease } from "@/lib/messageServer";
import { requireLeaseAccess } from "@/lib/leaseAccessServer";
import { errorResponse, HttpError, requireUser } from "@/lib/sessionServer";

/** Moves a listing inquiry into the lease it became — by one of that lease's own parties. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { listingId, leaseId } = await req.json();
    if (!listingId || !leaseId) throw new HttpError("listingId and leaseId are required", 400);
    await requireLeaseAccess(String(leaseId), user);
    await migrateListingThreadToLease(listingId, leaseId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
