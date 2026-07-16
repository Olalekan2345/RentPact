import type { Address, Hex } from "viem";
import { tenancyCredentialAbi } from "@/lib/contracts/tenancyCredentialAbi";
import { publicClient, tenancyCredentialAddress } from "@/lib/contracts/rentPactEscrow";
import { envResult } from "@/lib/env";

const deployBlock =
  envResult.success && envResult.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK !== undefined
    ? BigInt(envResult.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK)
    : 0n;

// Same 10,000-block eth_getLogs cap as onChainLease.ts.
const LOG_QUERY_CHUNK_BLOCKS = 9_000n;
/** Re-scan this many trailing blocks past the saved cursor, in case a block
 * near the edge was still being reorganized when it was last scanned. */
const SCAN_OVERLAP_BLOCKS = 50n;

export interface TenancyCredentialSummary {
  tokenId: bigint;
  leaseId: bigint;
  durationDays: number;
  totalPeriods: number;
  onTimePeriods: number;
  disputesLost: number;
  completionDate: number;
}

// Mirrors onChainLease.ts's incremental scan cache: mint events are
// append-only, so each owner's scan resumes from its last-seen block instead
// of re-walking the whole history (deployBlock to tip is 400k+ blocks and
// growing) on every load. Without this, a first load could take dozens of
// sequential chunked eth_getLogs calls — against an RPC that serves only one
// request at a time — and any single failed chunk left the credentials
// panel stuck loading forever (no error handling below it either).
interface StoredLog {
  tokenId: bigint;
  transactionHash: Hex;
  logIndex: number;
}

interface ScanCache {
  cursor: bigint;
  logs: StoredLog[];
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? { __bigint: value.toString() } : value;
}

function bigintReviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && "__bigint" in (value as Record<string, unknown>)) {
    return BigInt((value as { __bigint: string }).__bigint);
  }
  return value;
}

function scanCacheKey(address: Address, owner: Address): string {
  return `rentpact:credentialscan:v1:${address}:${owner}`;
}

function readScanCache(key: string): ScanCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw, bigintReviver) as ScanCache) : null;
  } catch {
    return null;
  }
}

function writeScanCache(key: string, cache: ScanCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(cache, bigintReplacer));
  } catch {
    // quota — scans still work, just not incrementally next time
  }
}

async function scanMintedTokenIds(address: Address, owner: Address): Promise<bigint[]> {
  const latestBlock = await publicClient.getBlockNumber();

  const key = scanCacheKey(address, owner);
  const cached = readScanCache(key);
  const storedLogs: StoredLog[] = cached?.logs ?? [];
  const seen = new Set(storedLogs.map((l) => `${l.transactionHash}:${l.logIndex}`));

  let startBlock = deployBlock;
  if (cached) {
    const resumeFrom = cached.cursor - SCAN_OVERLAP_BLOCKS;
    startBlock = resumeFrom > deployBlock ? resumeFrom : deployBlock;
  }

  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += LOG_QUERY_CHUNK_BLOCKS) {
    const toBlock =
      fromBlock + LOG_QUERY_CHUNK_BLOCKS - 1n > latestBlock ? latestBlock : fromBlock + LOG_QUERY_CHUNK_BLOCKS - 1n;

    const logs = await publicClient.getContractEvents({
      address,
      abi: tenancyCredentialAbi,
      eventName: "Transfer",
      args: { from: "0x0000000000000000000000000000000000000000" as Address, to: owner },
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      if (log.args.tokenId === undefined) continue;
      const dedupeKey = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      storedLogs.push({ tokenId: log.args.tokenId, transactionHash: log.transactionHash, logIndex: log.logIndex });
    }
  }

  writeScanCache(key, { cursor: latestBlock, logs: storedLogs });
  return storedLogs.map((l) => l.tokenId);
}

/**
 * Scans Transfer(0x0, owner, tokenId) mint events rather than using
 * ERC721Enumerable — same "scan real events, never store a separate index"
 * principle as every other reputation/activity feature in this app, and
 * cheaper to deploy since TenancyCredential doesn't need the Enumerable
 * extension at all.
 */
export async function getCredentialsForOwner(owner: Address): Promise<TenancyCredentialSummary[]> {
  if (!tenancyCredentialAddress) return [];

  try {
    const tokenIds = await scanMintedTokenIds(tenancyCredentialAddress, owner);

    const credentials = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const data = await publicClient.readContract({
          address: tenancyCredentialAddress!,
          abi: tenancyCredentialAbi,
          functionName: "credentialData",
          args: [tokenId],
        });
        return {
          tokenId,
          leaseId: data.leaseId,
          durationDays: Number(data.durationDays),
          totalPeriods: Number(data.totalPeriods),
          onTimePeriods: Number(data.onTimePeriods),
          disputesLost: Number(data.disputesLost),
          completionDate: Number(data.completionDate) * 1000,
        };
      }),
    );

    return credentials.sort((a, b) => b.completionDate - a.completionDate);
  } catch (err) {
    // A stuck scan should never leave the credentials panel loading forever
    // — degrade to "none found" and let the next visit retry from cache.
    console.error("Could not load tenancy credentials:", err);
    return [];
  }
}
