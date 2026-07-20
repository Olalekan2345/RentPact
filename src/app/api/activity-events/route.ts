import { NextRequest, NextResponse } from "next/server";
import {
  recordActivityEvent,
  getActivityFeedForAddress,
  getActivityFeedForLease,
  type ActivityType,
  type ResolutionType,
} from "@/lib/activityEventServer";

const VALID_TYPES: ActivityType[] = [
  "deposit",
  "signed",
  "release",
  "dispute-raised",
  "dispute-resolved",
  "caution-claim-filed",
  "caution-released",
  "caution-claim-resolved",
];

const VALID_RESOLUTION_TYPES: ResolutionType[] = ["settlement", "arbitration", "auto-fallback"];

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const leaseId = req.nextUrl.searchParams.get("leaseId");

  if (leaseId) {
    const events = await getActivityFeedForLease(leaseId);
    return NextResponse.json({ events });
  }

  if (!address) {
    return NextResponse.json({ error: "address or leaseId query param is required" }, { status: 400 });
  }
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const events = await getActivityFeedForAddress(address, limit);
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  try {
    const { id, leaseId, type, timestamp, amount, txHash, landlordBps, resolutionType } = await req.json();

    if (!id || !leaseId || !VALID_TYPES.includes(type) || typeof timestamp !== "number") {
      return NextResponse.json(
        { error: "id, leaseId, a valid type, and a numeric timestamp are required" },
        { status: 400 },
      );
    }

    await recordActivityEvent({
      id,
      leaseId,
      type,
      timestamp,
      amount: typeof amount === "number" ? amount : null,
      txHash: typeof txHash === "string" ? txHash : null,
      landlordBps: typeof landlordBps === "number" ? landlordBps : null,
      resolutionType: VALID_RESOLUTION_TYPES.includes(resolutionType) ? resolutionType : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
