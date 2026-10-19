import { NextRequest, NextResponse } from "next/server";
import { listWalletTransfersForEmail, recordWalletTransfer } from "@/lib/walletTransferServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

/** The signed-in user's own transfer history. */
export async function GET(req: NextRequest) {
  try {
    const email = await requireSelf(req.nextUrl.searchParams.get("forEmail"));
    return NextResponse.json({ transfers: await listWalletTransfersForEmail(email) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, toAddress, amount, txHash } = await req.json();
    if (!toAddress || !amount || !txHash) throw new HttpError("toAddress, amount, txHash are required", 400);
    const transfer = await recordWalletTransfer({ email: await requireSelf(email), toAddress, amount, txHash });
    return NextResponse.json({ transfer });
  } catch (error) {
    return errorResponse(error);
  }
}
