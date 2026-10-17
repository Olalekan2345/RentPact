import "server-only";
import { decodeEventLog, type Address, type Hex } from "viem";
import { rentPactEscrowAbi } from "@/lib/contracts/rentPactEscrowAbi";
import { escrowAddress, publicClient } from "@/lib/contracts/rentPactEscrow";

/**
 * Every event the current RentPactEscrow has emitted, decoded — what the browser's history lookups (a
 * lease's on-chain proof panel, reputation, caution-fee records) read instead of the chain itself.
 *
 * Those lookups used to page eth_getLogs over the Arc RPC from the deploy block in 9,000-block steps, one
 * request at a time. By Oct 2026 that was ~1,650 requests per lookup for any browser without a saved
 * cursor (a judge, a new device, or every device after the move to rentpact.homes), and the queue held up
 * every other chain read on the page behind it. Arcscan (Blockscout) returns the whole history in a few
 * pages; we decode with our own ABI (Arcscan's decoded view guesses a wrong same-selector ABI for this
 * unverified contract). The last ~9,000 blocks are also read straight from the RPC, so an event mined
 * seconds ago shows even if Arcscan hasn't indexed it yet.
 */
const SCAN_BASE = process.env.ARCSCAN_API_BASE ?? "https://testnet.arcscan.app";
const TAIL_BLOCKS = 9_000n; // under Arc's 10,000-block eth_getLogs cap
const MAX_PAGES = 60; // 50 logs a page
const CACHE_MS = 5_000;

export interface EscrowLog {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  /** Block time in ms when Arcscan supplied it; absent for logs only the RPC tail has seen yet. */
  blockTimestamp?: number;
}

interface ScanLog {
  topics: (string | null)[];
  data: string;
  transaction_hash: string;
  block_number: number;
  block_timestamp: string;
  index: number;
}
interface LogsResponse {
  items?: ScanLog[];
  next_page_params?: Record<string, string> | null;
}

function decode(topics: readonly (string | null)[], data: string) {
  try {
    const present = topics.filter((t): t is string => t !== null) as [Hex, ...Hex[]];
    const { eventName, args } = decodeEventLog({ abi: rentPactEscrowAbi, data: data as Hex, topics: present });
    return { eventName, args: (args ?? {}) as Record<string, unknown> };
  } catch {
    return null; // not one of ours
  }
}

const logId = (log: Pick<EscrowLog, "transactionHash" | "logIndex">) => `${log.transactionHash.toLowerCase()}:${log.logIndex}`;

// Everything the indexer has returned so far. Arcscan lists newest first and history is append-only (Arc
// has deterministic finality), so a refresh stops at the first page that reaches a log already held —
// usually one request instead of the full walk.
let indexedSoFar: EscrowLog[] = [];

async function fromIndexer(address: Address): Promise<EscrowLog[]> {
  const known = new Set(indexedSoFar.map(logId));
  const logs: EscrowLog[] = [];
  let params: Record<string, string> | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(`${SCAN_BASE}/api/v2/addresses/${address}/logs${qs}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Arcscan logs ${res.status}`);
    const body: LogsResponse = await res.json();
    let reachedKnown = false;
    for (const item of body.items ?? []) {
      if (known.has(`${item.transaction_hash.toLowerCase()}:${Number(item.index)}`)) {
        reachedKnown = true;
        continue;
      }
      const decoded = decode(item.topics, item.data);
      if (!decoded) continue;
      logs.push({
        ...decoded,
        transactionHash: item.transaction_hash as Hex,
        blockNumber: BigInt(item.block_number),
        logIndex: Number(item.index),
        blockTimestamp: Date.parse(item.block_timestamp) || undefined,
      });
    }
    if (reachedKnown || !body.next_page_params) {
      // Keyed merge: two overlapping refreshes must not duplicate what they both found.
      const merged = new Map(indexedSoFar.map((l) => [logId(l), l]));
      for (const l of logs) merged.set(logId(l), l);
      indexedSoFar = [...merged.values()];
      return indexedSoFar;
    }
    params = body.next_page_params;
  }
  // Better to fail loudly (the browser falls back to its own scan) than to return a silently partial history.
  throw new Error("Escrow history is longer than the indexer page limit");
}

async function fromRecentBlocks(address: Address): Promise<EscrowLog[]> {
  const latest = await publicClient.getBlockNumber();
  const fromBlock = latest >= TAIL_BLOCKS ? latest - TAIL_BLOCKS + 1n : 0n;
  const raw = await publicClient.getLogs({ address, fromBlock, toBlock: latest });
  return raw.flatMap((log) => {
    const decoded = decode(log.topics, log.data);
    if (!decoded || log.transactionHash === null || log.blockNumber === null || log.logIndex === null) return [];
    return [{ ...decoded, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex }];
  });
}

async function load(address: Address): Promise<EscrowLog[]> {
  const [indexed, recent] = await Promise.all([
    fromIndexer(address),
    fromRecentBlocks(address).catch(() => [] as EscrowLog[]), // freshness top-up only
  ]);
  const byId = new Map<string, EscrowLog>();
  for (const log of [...recent, ...indexed]) byId.set(logId(log), log);
  return [...byId.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
}

// One indexer pass serves every request in a short window (a lease page asks for nine event types at once).
let cached: { at: number; logs: Promise<EscrowLog[]> } | null = null;

/** The current escrow's full decoded event history, oldest first. */
export function getEscrowLogs(): Promise<EscrowLog[]> {
  if (!escrowAddress) return Promise.resolve([]);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.logs;
  const logs = load(escrowAddress);
  cached = { at: Date.now(), logs };
  logs.catch(() => {
    if (cached?.logs === logs) cached = null;
  });
  return logs;
}
