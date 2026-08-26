import { NextRequest, NextResponse } from "next/server";
import { decodeEventLog, encodeEventTopics, type Hex } from "viem";
import { rentPactEscrowAbi } from "@/lib/contracts/rentPactEscrowAbi";

/**
 * The dispute half of a wallet's reputation, read from the Arcscan (Blockscout)
 * indexer instead of the Arc RPC. A full DisputeRaised/DisputeResolved scan over
 * the RPC (one request at a time, 10k-block getLogs cap) took minutes and left
 * the profile's reputation card stuck loading. Arcscan returns the escrow's logs
 * fast; we decode them with our own ABI (Arcscan's decoded view guesses a wrong
 * same-selector ABI for this unverified contract). Best-effort: any failure
 * returns zeros so the card still renders.
 */
const ESCROW = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;
const SCAN_BASE = process.env.ARCSCAN_API_BASE ?? "https://testnet.arcscan.app";
const CAUTION_CLAIM_DISPUTE_REASON = "Caution fee damage claim";
const BPS_HALF = 5000; // landlordBps < 50% => tenant kept the majority => "won"

const RAISED_T0 = encodeEventTopics({ abi: rentPactEscrowAbi, eventName: "DisputeRaised" })[0]?.toLowerCase();
const RESOLVED_T0 = encodeEventTopics({ abi: rentPactEscrowAbi, eventName: "DisputeResolved" })[0]?.toLowerCase();

interface ScanLog {
  topics: (string | null)[];
  data: string;
}
interface LogsResponse {
  items?: ScanLog[];
  next_page_params?: Record<string, string> | null;
}

const ZERO = { disputesRaised: 0, disputesWonAsTenant: 0, disputesLostAsTenant: 0, disputesPending: 0 };

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address) return NextResponse.json({ error: "address query param is required" }, { status: 400 });
  if (!ESCROW) return NextResponse.json(ZERO);

  try {
    const raisedLeaseIds = new Set<string>();
    const resolutions: { leaseId: string; landlordBps: number }[] = [];

    let params: Record<string, string> | undefined = undefined;
    for (let page = 0; page < 60; page++) {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      const res = await fetch(`${SCAN_BASE}/api/v2/addresses/${ESCROW}/logs${qs}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) break;
      const body: LogsResponse = await res.json();

      for (const log of body.items ?? []) {
        const t0 = log.topics?.[0]?.toLowerCase();
        if (t0 !== RAISED_T0 && t0 !== RESOLVED_T0) continue;
        try {
          const topics = log.topics.filter((t): t is string => t !== null) as [Hex, ...Hex[]];
          const decoded = decodeEventLog({ abi: rentPactEscrowAbi, data: log.data as Hex, topics });
          if (decoded.eventName === "DisputeRaised") {
            const { leaseId, tenant, reason } = decoded.args as { leaseId: bigint; tenant: string; reason: string };
            if (tenant.toLowerCase() === address && reason !== CAUTION_CLAIM_DISPUTE_REASON) {
              raisedLeaseIds.add(leaseId.toString());
            }
          } else if (decoded.eventName === "DisputeResolved") {
            const { leaseId, landlordBps } = decoded.args as { leaseId: bigint; landlordBps: number };
            resolutions.push({ leaseId: leaseId.toString(), landlordBps: Number(landlordBps) });
          }
        } catch {
          // Undecodable log — skip.
        }
      }

      if (!body.next_page_params) break;
      params = body.next_page_params;
    }

    const own = resolutions.filter((r) => raisedLeaseIds.has(r.leaseId));
    return NextResponse.json({
      disputesRaised: raisedLeaseIds.size,
      disputesWonAsTenant: own.filter((r) => r.landlordBps < BPS_HALF).length,
      disputesLostAsTenant: own.filter((r) => r.landlordBps >= BPS_HALF).length,
      disputesPending: raisedLeaseIds.size - own.length,
    });
  } catch {
    return NextResponse.json(ZERO);
  }
}
