import { NextRequest, NextResponse } from "next/server";
import { circleGetTransaction } from "@/lib/circleServer";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userToken = req.headers.get("x-user-token");
    if (!userToken) return NextResponse.json({ error: "X-User-Token header is required" }, { status: 400 });
    const data = await circleGetTransaction(userToken, params.id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
