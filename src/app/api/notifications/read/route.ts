import { NextRequest, NextResponse } from "next/server";
import { listReadIds, markRead } from "@/lib/notificationReadServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await requireSelf(req.nextUrl.searchParams.get("email"));
    return NextResponse.json({ readIds: await listReadIds(email) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, notificationIds } = await req.json();
    if (!Array.isArray(notificationIds)) throw new HttpError("notificationIds[] is required", 400);
    await markRead(await requireSelf(email), notificationIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
