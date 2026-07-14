import { NextRequest, NextResponse } from "next/server";
import { circleCreateContractExecutionTransaction } from "@/lib/circleServer";

export async function POST(req: NextRequest) {
  try {
    const userToken = req.headers.get("x-user-token");
    if (!userToken) return NextResponse.json({ error: "X-User-Token header is required" }, { status: 400 });

    const { idempotencyKey, walletId, contractAddress, abiFunctionSignature, abiParameters, callData, feeLevel } =
      await req.json();

    if (!idempotencyKey || !walletId || !contractAddress || !(abiFunctionSignature || callData)) {
      return NextResponse.json(
        { error: "idempotencyKey, walletId, contractAddress, and either abiFunctionSignature or callData are required" },
        { status: 400 },
      );
    }

    const data = await circleCreateContractExecutionTransaction({
      userToken,
      idempotencyKey,
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters,
      callData,
      feeLevel,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
