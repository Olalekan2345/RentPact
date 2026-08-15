import { NextRequest, NextResponse } from "next/server";
import { markMessagesDelivered } from "@/lib/messageServer";

export async function POST(req: NextRequest) {
  const { readerEmail } = await req.json();
  if (!readerEmail) {
    return NextResponse.json({ error: "readerEmail is required" }, { status: 400 });
  }
  await markMessagesDelivered(readerEmail);
  return NextResponse.json({ ok: true });
}
