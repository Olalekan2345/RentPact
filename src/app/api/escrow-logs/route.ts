import { NextResponse } from "next/server";
import { getEscrowLogs } from "@/lib/escrowLogsServer";

export const dynamic = "force-dynamic";

/**
 * The current escrow's full decoded event history (see escrowLogsServer). Public on-chain data, so no
 * session is required. bigints travel as {"__bigint": "<decimal>"}, the same encoding onChainLease.ts
 * already uses for its scan cache.
 */
export async function GET() {
  try {
    const logs = await getEscrowLogs();
    const body = JSON.stringify({ logs }, (_key, value) =>
      typeof value === "bigint" ? { __bigint: value.toString() } : value,
    );
    return new NextResponse(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't read the escrow's history right now." }, { status: 502 });
  }
}
