import { NextRequest, NextResponse } from "next/server";
import { getPrefs, updatePrefs } from "@/lib/notificationPrefsServer";
import { errorResponse, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await requireSelf(req.nextUrl.searchParams.get("email"));
    return NextResponse.json({ prefs: await getPrefs(email) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { email, ...updates } = await req.json();
    return NextResponse.json({ prefs: await updatePrefs(await requireSelf(email), updates) });
  } catch (error) {
    return errorResponse(error);
  }
}
