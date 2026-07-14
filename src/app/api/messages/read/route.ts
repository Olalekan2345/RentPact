import { NextRequest, NextResponse } from "next/server";
import { markThreadRead } from "@/lib/messageServer";

export async function POST(req: NextRequest) {
  const { leaseId, listingId, counterpartyEmail, readerEmail } = await req.json();
  if ((!leaseId && !listingId) || !readerEmail) {
    return NextResponse.json({ error: "leaseId or listingId, and readerEmail, are required" }, { status: 400 });
  }
  await markThreadRead({ leaseId, listingId, counterpartyEmail }, readerEmail);
  return NextResponse.json({ ok: true });
}
