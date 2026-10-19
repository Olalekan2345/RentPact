import { NextRequest, NextResponse } from "next/server";
import { markMessagesDelivered } from "@/lib/messageServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

export async function POST(req: NextRequest) {
  try {
    const { readerEmail } = await req.json();
    if (!readerEmail) throw new HttpError("readerEmail is required", 400);
    await markMessagesDelivered(await requireSelf(readerEmail));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
