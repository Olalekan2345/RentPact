import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription } from "@/lib/pushServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

/** Subscribes this device to the signed-in user's own notifications (never someone else's). */
export async function POST(req: NextRequest) {
  try {
    const { email, subscription } = await req.json();
    if (!subscription?.endpoint) throw new HttpError("subscription is required", 400);
    await savePushSubscription(await requireSelf(email), subscription);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
