import { NextRequest, NextResponse } from "next/server";
import { encodeEventTopics } from "viem";
import { rentPactEscrowAbi } from "@/lib/contracts/rentPactEscrowAbi";

/**
 * Every lease that has ever had a dispute raised, for the arbiter view. The
 * arbiter isn't a party to any lease, so it can't discover disputes from its
 * own lease lists — this reads the disputed lease ids from the Arcscan indexer
 * (fast; the RPC full-log scan is far too slow). The client then reads each
 * lease's live state to keep only the ones still active.
 *
 * Both rent disputes and caution-fee claims are DisputeRaised events that go to
 * the arbiter for a Tier-2 ruling, so we include both — the leaseId is the
 * first indexed topic, so we don't need to decode the reason.
 *
 * Gated to the configured arbiter address. That address is public
 * (NEXT_PUBLIC_*), so this is a soft gate for tidiness, not a security boundary
 * — the dispute data is public on-chain and the ruling is enforced on-chain
 * (only the arbiter wallet can resolve).
 */
const ESCROW = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;
const ARBITER = process.env.NEXT_PUBLIC_ARC_ARBITER_ADDRESS?.toLowerCase();
const SCAN_BASE = process.env.ARCSCAN_API_BASE ?? "https://testnet.arcscan.app";
const RAISED_T0 = encodeEventTopics({ abi: rentPactEscrowAbi, eventName: "DisputeRaised" })[0]?.toLowerCase();

interface ScanLog {
  topics: (string | null)[];
}
interface LogsResponse {
  items?: ScanLog[];
  next_page_params?: Record<string, string> | null;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!ESCROW || !ARBITER || address !== ARBITER) return NextResponse.json({ leaseIds: [] });

  try {
    const ids = new Set<string>();
    let params: Record<string, string> | undefined = undefined;
    for (let page = 0; page < 60; page++) {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      const res = await fetch(`${SCAN_BASE}/api/v2/addresses/${ESCROW}/logs${qs}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) break;
      const body: LogsResponse = await res.json();
      for (const log of body.items ?? []) {
        if (log.topics?.[0]?.toLowerCase() !== RAISED_T0) continue;
        const leaseIdTopic = log.topics[1];
        if (leaseIdTopic) ids.add(BigInt(leaseIdTopic).toString());
      }
      if (!body.next_page_params) break;
      params = body.next_page_params;
    }
    return NextResponse.json({ leaseIds: [...ids] });
  } catch {
    return NextResponse.json({ leaseIds: [] });
  }
}
