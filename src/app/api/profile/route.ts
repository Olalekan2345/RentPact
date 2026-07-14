import { NextRequest, NextResponse } from "next/server";
import { getProfile, updateProfile } from "@/lib/profileServer";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  const profile = await getProfile(email);
  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  try {
    const { email, name, photoUrl } = await req.json();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
    const profile = await updateProfile(email, { name, photoUrl });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
