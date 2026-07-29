import "server-only";
import { recordActivityEvent, type ActivityType } from "@/lib/activityEventServer";

/**
 * Self-heals the activity feed from the chain. Money events (rent releases,
 * caution-fee returns) are mirrored into activity_events by a fire-and-forget
 * write at the moment they happen (leaseData.ts); when that write drops, the
 * event is on-chain but missing from the feed, so it never shows in
 * transaction history or the lease record. This reconstructs any missing ones
 * from the current contract's event logs and upserts them — so the feed
 * converges on the chain instead of depending on one client write succeeding.
 *
 * Reads logs from the Arcscan (Blockscout) indexer rather than the Arc RPC (the
 * RPC caps eth_getLogs at 10k blocks and rate-limits hard). Only the current
 * escrow's logs are read, so stale rows from old deployments are never
 * reintroduced. Best-effort: every failure path is swallowed — a feed read must
 * never fail because self-heal couldn't reach the indexer.
 */
const ESCROW = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;
const SCAN_BASE = process.env.ARCSCAN_API_BASE ?? "https://testnet.arcscan.app";
const USDC_DECIMALS = 6;

// Event topic0 -> how to turn its log into a feed row. `amountWord` is the
// index of the 32-byte data word holding the USDC amount (base units).
//   TrancheReleased(leaseId, periodsReleased, amountReleased, totalReleased)
//   CautionReleased(leaseId, amount)
const HEALED_EVENTS: Record<string, { type: ActivityType; amountWord: number }> = {
  "0x93be08d1fbf976af717307eec845a2147837d5eed255f8715e35898336f9e4d8": { type: "release", amountWord: 1 },
  "0x8af2865f2fb26a4160828c0c4b6831c26360e12a69fa9193331a59d7fbc7ad47": { type: "caution-released", amountWord: 0 },
};

// Throttle per lease so a burst of views triggers at most one indexer pass per
// lease per window (module-level; best-effort within a warm serverless instance).
const lastReconciled = new Map<string, number>();
const TTL_MS = 60_000;

interface ScanLog {
  topics: (string | null)[];
  data: string;
  transaction_hash: string;
  block_timestamp: string;
}
interface LogsResponse {
  items?: ScanLog[];
  next_page_params?: Record<string, string> | null;
}

function dataWord(dataHex: string, i: number): bigint {
  const start = 2 + i * 64;
  return BigInt("0x" + dataHex.slice(start, start + 64));
}

/** Top up the feed's money rows (releases, caution returns) for the given leases from the current contract. */
export async function reconcileFeedFromChain(leaseIds: string[]): Promise<void> {
  if (!ESCROW) return;
  const now = Date.now();
  const due = [...new Set(leaseIds.map(String))].filter((id) => now - (lastReconciled.get(id) ?? 0) >= TTL_MS);
  if (due.length === 0) return;
  for (const id of due) lastReconciled.set(id, now);
  const wanted = new Set(due);

  try {
    let params: Record<string, string> | undefined = undefined;
    const upserts: Promise<void>[] = [];
    for (let page = 0; page < 20; page++) {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      const res = await fetch(`${SCAN_BASE}/api/v2/addresses/${ESCROW}/logs${qs}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const body: LogsResponse = await res.json();
      for (const log of body.items ?? []) {
        const topic0 = log.topics?.[0];
        const topic1 = log.topics?.[1];
        if (!topic0 || !topic1) continue;
        const spec = HEALED_EVENTS[topic0.toLowerCase()];
        if (!spec) continue;
        const leaseId = BigInt(topic1).toString();
        if (!wanted.has(leaseId)) continue;
        upserts.push(
          recordActivityEvent({
            id: `${log.transaction_hash}-${spec.type}`,
            leaseId,
            type: spec.type,
            timestamp: Date.parse(log.block_timestamp),
            amount: Number(dataWord(log.data, spec.amountWord)) / 10 ** USDC_DECIMALS,
            txHash: log.transaction_hash,
            landlordBps: null,
            resolutionType: null,
          }).catch(() => {}),
        );
      }
      if (!body.next_page_params) break;
      params = body.next_page_params;
    }
    await Promise.all(upserts);
  } catch {
    // Best-effort: on any failure, leave the feed as-is and let the next view retry.
    for (const id of due) lastReconciled.delete(id);
  }
}
