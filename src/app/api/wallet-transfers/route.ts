import { NextRequest, NextResponse } from "next/server";
import { listWalletTransfersForEmail, recordWalletTransfer } from "@/lib/walletTransferServer";

export async function GET(req: NextRequest) {
  const forEmail = req.nextUrl.searchParams.get("forEmail");
  if (!forEmail) return NextResponse.json({ error: "forEmail query param is required" }, { status: 400 });
  const transfers = await listWalletTransfersForEmail(forEmail);
  return NextResponse.json({ transfers });
}

export async function POST(req: NextRequest) {
  try {
    const { email, toAddress, amount, txHash } = await req.json();

    if (!email || !toAddress || !amount || !txHash) {
      return NextResponse.json({ error: "email, toAddress, amount, txHash are required" }, { status: 400 });
    }

    const transfer = await recordWalletTransfer({ email, toAddress, amount, txHash });
    return NextResponse.json({ transfer });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
