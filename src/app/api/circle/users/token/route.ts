import { NextRequest, NextResponse } from "next/server";
import { circleCreateUserToken } from "@/lib/circleServer";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    const data = await circleCreateUserToken(userId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
