import { NextRequest, NextResponse } from "next/server";
import { getProfile, updateProfile } from "@/lib/profileServer";
import { errorResponse, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

/** Public: name and photo are shown on profile pages. */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  const profile = await getProfile(email);
  return NextResponse.json({ profile });
}

/** Only the signed-in user can change their own name and photo — otherwise anyone could impersonate anyone. */
export async function PUT(req: NextRequest) {
  try {
    const { email, name, photoUrl } = await req.json();
    const profile = await updateProfile(await requireSelf(email), { name, photoUrl });
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
