import { NextRequest, NextResponse } from "next/server";
import { getPrivacyPrefs, updatePrivacyPrefs } from "@/lib/privacyServer";
import { errorResponse, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

/** Public: other people's profile pages read these to know what to hide. */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  const prefs = await getPrivacyPrefs(email);
  return NextResponse.json({ prefs });
}

/** Only the signed-in user can change their own privacy settings. */
export async function PUT(req: NextRequest) {
  try {
    const { email, ...updates } = await req.json();
    return NextResponse.json({ prefs: await updatePrivacyPrefs(await requireSelf(email), updates) });
  } catch (error) {
    return errorResponse(error);
  }
}
