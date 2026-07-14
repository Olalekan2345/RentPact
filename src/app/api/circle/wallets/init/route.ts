import { NextRequest, NextResponse } from "next/server";
import { circleInitializeWallet } from "@/lib/circleServer";

export async function POST(req: NextRequest) {
  try {
    const { userToken, idempotencyKey, blockchains } = await req.json();
    if (!userToken || !idempotencyKey || !blockchains) {
      return NextResponse.json({ error: "userToken, idempotencyKey, blockchains are required" }, { status: 400 });
    }
    const data = await circleInitializeWallet({ userToken, idempotencyKey, blockchains });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
