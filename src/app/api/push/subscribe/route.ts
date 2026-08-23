import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription } from "@/lib/pushServer";

export async function POST(req: NextRequest) {
  try {
    const { email, subscription } = await req.json();
    if (!email || !subscription?.endpoint) {
      return NextResponse.json({ error: "email and subscription are required" }, { status: 400 });
    }
    await savePushSubscription(email, subscription);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
