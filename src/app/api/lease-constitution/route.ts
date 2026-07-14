import { NextRequest, NextResponse } from "next/server";
import { recordLeaseConstitution, getLeaseConstitution } from "@/lib/leaseConstitutionServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const record = await getLeaseConstitution(leaseId);
  return NextResponse.json({ record });
}

export async function POST(req: NextRequest) {
  const { leaseId, version, hash, acceptedAt } = await req.json();
  if (!leaseId || !version || !hash || !acceptedAt) {
    return NextResponse.json({ error: "leaseId, version, hash, acceptedAt are required" }, { status: 400 });
  }
  await recordLeaseConstitution({ leaseId, version, hash, acceptedAt });
  return NextResponse.json({ ok: true });
}
