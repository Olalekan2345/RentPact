import { NextRequest, NextResponse } from "next/server";
import { findLeaseIdsForAddress } from "@/lib/leaseMetadataServer";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const role = req.nextUrl.searchParams.get("role");
  if (!address || (role !== "tenant" && role !== "landlord")) {
    return NextResponse.json({ error: "address and role=tenant|landlord query params are required" }, { status: 400 });
  }
  const leaseIds = await findLeaseIdsForAddress(address, role);
  return NextResponse.json({ leaseIds });
}
