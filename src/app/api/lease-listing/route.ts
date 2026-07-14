import { NextRequest, NextResponse } from "next/server";
import { linkLeaseToListing, getListingIdForLease } from "@/lib/leaseListingServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const listingId = await getListingIdForLease(leaseId);
  return NextResponse.json({ listingId });
}

export async function POST(req: NextRequest) {
  const { leaseId, listingId } = await req.json();
  if (!leaseId || !listingId) {
    return NextResponse.json({ error: "leaseId and listingId are required" }, { status: 400 });
  }
  await linkLeaseToListing(leaseId, listingId);
  return NextResponse.json({ ok: true });
}
