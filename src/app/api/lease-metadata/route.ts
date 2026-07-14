import { NextRequest, NextResponse } from "next/server";
import { getLeaseMetadata, saveLeaseMetadata } from "@/lib/leaseMetadataServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const metadata = await getLeaseMetadata(leaseId);
  return NextResponse.json({ metadata });
}

export async function POST(req: NextRequest) {
  try {
    const { leaseId, propertyAddress, propertyType, photoUrl, tenantEmail, landlordEmail } = await req.json();

    if (!leaseId || !propertyAddress || !propertyType || !tenantEmail || !landlordEmail) {
      return NextResponse.json(
        { error: "leaseId, propertyAddress, propertyType, tenantEmail, landlordEmail are required" },
        { status: 400 },
      );
    }

    await saveLeaseMetadata(leaseId, { propertyAddress, propertyType, photoUrl: photoUrl ?? null, tenantEmail, landlordEmail });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
