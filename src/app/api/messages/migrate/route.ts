import { NextRequest, NextResponse } from "next/server";
import { migrateListingThreadToLease } from "@/lib/messageServer";

export async function POST(req: NextRequest) {
  const { listingId, leaseId } = await req.json();
  if (!listingId || !leaseId) {
    return NextResponse.json({ error: "listingId and leaseId are required" }, { status: 400 });
  }
  await migrateListingThreadToLease(listingId, leaseId);
  return NextResponse.json({ ok: true });
}
