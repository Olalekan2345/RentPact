import { NextRequest, NextResponse } from "next/server";
import { listReadIds, markRead } from "@/lib/notificationReadServer";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  const readIds = await listReadIds(email);
  return NextResponse.json({ readIds });
}

export async function POST(req: NextRequest) {
  const { email, notificationIds } = await req.json();
  if (!email || !Array.isArray(notificationIds)) {
    return NextResponse.json({ error: "email and notificationIds[] are required" }, { status: 400 });
  }
  await markRead(email, notificationIds);
  return NextResponse.json({ ok: true });
}
