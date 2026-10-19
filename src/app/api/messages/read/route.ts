import { NextRequest, NextResponse } from "next/server";
import { markThreadRead } from "@/lib/messageServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

export async function POST(req: NextRequest) {
  try {
    const { leaseId, listingId, counterpartyEmail, readerEmail } = await req.json();
    if ((!leaseId && !listingId) || !readerEmail) {
      throw new HttpError("leaseId or listingId, and readerEmail, are required", 400);
    }
    await markThreadRead({ leaseId, listingId, counterpartyEmail }, await requireSelf(readerEmail));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
