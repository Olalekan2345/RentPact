import { NextRequest, NextResponse } from "next/server";
import { circleListTransactions } from "@/lib/circleServer";

export async function GET(req: NextRequest) {
  try {
    const userToken = req.headers.get("x-user-token");
    const walletId = req.nextUrl.searchParams.get("walletId");
    if (!userToken) return NextResponse.json({ error: "X-User-Token header is required" }, { status: 400 });
    if (!walletId) return NextResponse.json({ error: "walletId query param is required" }, { status: 400 });
    const data = await circleListTransactions(userToken, walletId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
