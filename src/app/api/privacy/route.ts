import { NextRequest, NextResponse } from "next/server";
import { getPrivacyPrefs, updatePrivacyPrefs } from "@/lib/privacyServer";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  const prefs = await getPrivacyPrefs(email);
  return NextResponse.json({ prefs });
}

export async function PUT(req: NextRequest) {
  const { email, ...updates } = await req.json();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  const prefs = await updatePrivacyPrefs(email, updates);
  return NextResponse.json({ prefs });
}
