import { NextRequest, NextResponse } from "next/server";
import { linkLeaseToListing, getListingIdForLease } from "@/lib/leaseListingServer";
import { requireLeaseAccess } from "@/lib/leaseAccessServer";
import { errorResponse, HttpError, requireUser } from "@/lib/sessionServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const listingId = await getListingIdForLease(leaseId);
  return NextResponse.json({ listingId });
}

/** Links a lease to the listing it came from — by one of that lease's parties. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { leaseId, listingId } = await req.json();
    if (!leaseId || !listingId) throw new HttpError("leaseId and listingId are required", 400);
    await requireLeaseAccess(String(leaseId), user);
    await linkLeaseToListing(leaseId, listingId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
