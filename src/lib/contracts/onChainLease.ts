import { encodeFunctionData, decodeEventLog, parseUnits, formatUnits, type Address, type Hex } from "viem";
import { rentPactEscrowAbi, erc20Abi } from "@/lib/contracts/rentPactEscrowAbi";
import { publicClient, escrowAddress, usdcAddress } from "@/lib/contracts/rentPactEscrow";
import { envResult } from "@/lib/env";

const deployBlock =
  envResult.success && envResult.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK !== undefined
    ? BigInt(envResult.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK)
    : 0n;
import { ONCHAIN_TO_FREQUENCY, FREQUENCY_TO_ONCHAIN } from "@/lib/contracts/frequency";
import type { ReleaseFrequency } from "@/components/escrow";

/**
 * Native USDC on Arc is wrapped by an optional ERC-20 interface using 6
 * decimals (per docs.arc.io/arc/references/contract-addresses) — distinct
 * from the chain's native-currency decimals (18) used for gas accounting.
 * All lease amounts are denominated in this 6-decimal USDC unit.
 */
export const USDC_DECIMALS = 6;

/** Matches RentPactEscrow.BPS_DENOMINATOR — landlordBps is out of this. */
export const BPS_DENOMINATOR = 10_000;

export function toBaseUnits(amount: number): bigint {
  return parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

export function fromBaseUnits(amount: bigint): number {
  return Number(formatUnits(amount, USDC_DECIMALS));
}

const ZERO_ADDRESS: Address = `0x${"0".repeat(40)}` as Address;

function requireEscrowAddress(): Address {
  if (!escrowAddress) throw new Error("RentPactEscrow is not deployed yet — see SETUP.md.");
  return escrowAddress;
}

function requireUsdcAddress(): Address {
  if (!usdcAddress) throw new Error("USDC contract address is not configured.");
  return usdcAddress;
}

export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

export function encodeTransfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
}

export function encodeCreateLease(
  landlord: Address,
  amountPerPeriod: number,
  periods: number,
  frequency: ReleaseFrequency,
  cautionAmount = 0,
): Hex {
  return encodeFunctionData({
    abi: rentPactEscrowAbi,
    functionName: "createLease",
    args: [
      landlord,
      toBaseUnits(amountPerPeriod),
      BigInt(periods),
      FREQUENCY_TO_ONCHAIN[frequency],
      toBaseUnits(cautionAmount),
    ],
  });
}

export function encodeSignLease(leaseId: bigint): Hex {
  return encodeFunctionData({ abi: rentPactEscrowAbi, functionName: "signLease", args: [leaseId] });
}

export function encodeReleaseTranche(leaseId: bigint): Hex {
  return encodeFunctionData({ abi: rentPactEscrowAbi, functionName: "releaseTranche", args: [leaseId] });
}

export function encodeRaiseDispute(leaseId: bigint, reason: string): Hex {
  return encodeFunctionData({ abi: rentPactEscrowAbi, functionName: "raiseDispute", args: [leaseId, reason] });
}

/** landlordBps out of 10_000 — e.g. 10_000 releases the schedule unchanged (old "true"), 0 refunds everything now (old "false"), anything else settles the remainder immediately by ratio. */
export function encodeResolveDispute(leaseId: bigint, landlordBps: number): Hex {
  return encodeFunctionData({
    abi: rentPactEscrowAbi,
    functionName: "resolveDispute",
    args: [leaseId, landlordBps],
  });
}

export function encodeProposeSettlement(leaseId: bigint, landlordBps: number): Hex {
  return encodeFunctionData({
    abi: rentPactEscrowAbi,
    functionName: "proposeSettlement",
    args: [leaseId, landlordBps],
  });
}

export function encodeAcceptSettlement(leaseId: bigint): Hex {
  return encodeFunctionData({ abi: rentPactEscrowAbi, functionName: "acceptSettlement", args: [leaseId] });
}

export function encodeAutoResolveOverdueDispute(leaseId: bigint): Hex {
  return encodeFunctionData({
    abi: rentPactEscrowAbi,
    functionName: "autoResolveOverdueDispute",
    args: [leaseId],
  });
}

export function encodeCancelUnsigned(leaseId: bigint): Hex {
  return encodeFunctionData({ abi: rentPactEscrowAbi, functionName: "cancelUnsigned", args: [leaseId] });
}

export function encodeFileDepositClaim(leaseId: bigint, claimAmount: number, evidenceHash: Hex): Hex {
  return encodeFunctionData({
    abi: rentPactEscrowAbi,
    functionName: "fileDepositClaim",
    args: [leaseId, toBaseUnits(claimAmount), evidenceHash],
  });
}

export function encodeReleaseCaution(leaseId: bigint): Hex {
  return encodeFunctionData({ abi: rentPactEscrowAbi, functionName: "releaseCaution", args: [leaseId] });
}

export async function readAllowance(owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: requireUsdcAddress(),
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, requireEscrowAddress()],
  });
}

/** Extracts the leaseId assigned by createLease from a confirmed transaction's logs. */
export async function extractLeaseIdFromReceipt(hash: Hex): Promise<bigint | null> {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: rentPactEscrowAbi,
        eventName: "LeaseCreated",
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "LeaseCreated") return decoded.args.leaseId;
    } catch {
      // not a LeaseCreated log — skip
    }
  }
  return null;
}

export interface OnChainLease {
  leaseId: bigint;
  tenant: Address;
  landlord: Address;
  amountPerPeriod: number;
  totalPeriods: number;
  periodsReleased: number;
  frequency: ReleaseFrequency;
  createdAt: number;
  signedAt: number | null;
  signed: boolean;
  cancelled: boolean;
  disputeActive: boolean;
  disputeRaisedAt: number | null;
  disputeReason: string | null;
  settlementProposedBps: number | null;
  settlementProposer: Address | null;
  /** 0 means this lease has no caution fee. */
  cautionAmount: number;
  /** null until the lease has released all rent tranches (or a rent dispute concludes it). Anchors the 7-day claim window. */
  completedAt: number | null;
  /** null means no claim has been filed. */
  cautionClaimedAmount: number | null;
  cautionClaimEvidenceHash: Hex | null;
  cautionClaimFiledAt: number | null;
  cautionSettled: boolean;
  /** true while the currently active dispute (if any) is over the claimed caution amount rather than rent tranches. */
  disputeIsCautionClaim: boolean;
}

export async function readLease(leaseId: bigint): Promise<OnChainLease> {
  const lease = await publicClient.readContract({
    address: requireEscrowAddress(),
    abi: rentPactEscrowAbi,
    functionName: "getLease",
    args: [leaseId],
  });

  return {
    leaseId,
    tenant: lease.tenant,
    landlord: lease.landlord,
    amountPerPeriod: fromBaseUnits(lease.amountPerPeriod),
    totalPeriods: Number(lease.totalPeriods),
    periodsReleased: Number(lease.periodsReleased),
    frequency: ONCHAIN_TO_FREQUENCY[lease.frequency] ?? "monthly",
    createdAt: Number(lease.createdAt) * 1000,
    signedAt: lease.signed ? Number(lease.signedAt) * 1000 : null,
    signed: lease.signed,
    cancelled: lease.cancelled,
    disputeActive: lease.disputeActive,
    disputeRaisedAt: lease.disputeActive ? Number(lease.disputeRaisedAt) * 1000 : null,
    disputeReason: lease.disputeActive ? lease.disputeReason : null,
    settlementProposedBps:
      lease.disputeActive && lease.settlementProposer !== ZERO_ADDRESS ? lease.settlementProposedBps : null,
    settlementProposer:
      lease.disputeActive && lease.settlementProposer !== ZERO_ADDRESS ? lease.settlementProposer : null,
    cautionAmount: fromBaseUnits(lease.cautionAmount),
    completedAt: lease.completedAt > 0n ? Number(lease.completedAt) * 1000 : null,
    cautionClaimedAmount: lease.cautionClaimFiledAt > 0n ? fromBaseUnits(lease.cautionClaimedAmount) : null,
    cautionClaimEvidenceHash: lease.cautionClaimFiledAt > 0n ? lease.cautionClaimEvidenceHash : null,
    cautionClaimFiledAt: lease.cautionClaimFiledAt > 0n ? Number(lease.cautionClaimFiledAt) * 1000 : null,
    cautionSettled: lease.cautionSettled,
    disputeIsCautionClaim: lease.disputeActive && lease.disputeIsCautionClaim,
  };
}

export interface ResolvedDisputeRecord {
  raisedAt: number;
  resolvedAt: number;
  landlordBps: number;
  resolutionType: "settlement" | "arbitration" | "auto-fallback";
}

const RESOLUTION_TYPE_LABEL = ["settlement", "arbitration", "auto-fallback"] as const;

/** The exact `reason` fileDepositClaim passes to DisputeRaised — used to tell a rent
 * dispute's raise event apart from a caution claim's, since both currently emit the
 * same event so the shared Evidence Timeline can find either kind. */
const CAUTION_CLAIM_DISPUTE_REASON = "Caution fee damage claim";

/**
 * Reconstructs a lease's full rent-dispute history from real DisputeRaised /
 * DisputeResolved events — getLease() only exposes the current dispute, if
 * any, so past cycles (raise → resolve → raise → resolve) have to be paired
 * up from the event log itself, oldest DisputeRaised to each DisputeResolved
 * in order. Caution claim raises (same event, different resolution event —
 * see getCautionClaimHistory) are excluded by their fixed reason string.
 */
export async function getResolvedDisputesForLease(leaseId: bigint): Promise<ResolvedDisputeRecord[]> {
  const args = { leaseId };
  const [raisedLogs, resolvedLogs] = await Promise.all([
    queryEventsChunked("DisputeRaised", args, (log) =>
      (log.args.reason as string) === CAUTION_CLAIM_DISPUTE_REASON ? null : log,
    ),
    queryEventsChunked("DisputeResolved", args, (log) => log),
  ]);

  const raisedTimestamps = await Promise.all(raisedLogs.map((log) => blockTimestampMs(log.blockNumber)));
  const sortedRaised = raisedTimestamps.slice().sort((a, b) => a - b);

  const resolved = await Promise.all(
    resolvedLogs.map(async (log) => ({
      resolvedAt: await blockTimestampMs(log.blockNumber),
      landlordBps: Number(log.args.landlordBps as number),
      resolutionType: RESOLUTION_TYPE_LABEL[Number(log.args.resolutionType as number)] ?? "arbitration",
    })),
  );
  resolved.sort((a, b) => a.resolvedAt - b.resolvedAt);

  return resolved.map((r, i) => ({ ...r, raisedAt: sortedRaised[i] ?? r.resolvedAt }));
}

export interface CautionClaimRecord {
  filedAt: number;
  claimAmount: number;
  evidenceHash: Hex;
  remainderReleased: number;
  resolved: boolean;
  resolvedAt: number | null;
  landlordBps: number | null;
  resolutionType: "settlement" | "arbitration" | "auto-fallback" | null;
  releasedToLandlord: number | null;
  refundedToTenant: number | null;
}

/** A lease can only ever have one caution claim, so this pairs the single
 * DepositClaimFiled with the single CautionClaimResolved, if it's happened yet. */
export async function getCautionClaimHistory(leaseId: bigint): Promise<CautionClaimRecord | null> {
  const args = { leaseId };
  const [filedLogs, resolvedLogs] = await Promise.all([
    queryEventsChunked("DepositClaimFiled", args, (log) => log),
    queryEventsChunked("CautionClaimResolved", args, (log) => log),
  ]);
  if (filedLogs.length === 0) return null;

  const filedLog = filedLogs[0];
  const filedAt = await blockTimestampMs(filedLog.blockNumber);
  const resolvedLog = resolvedLogs[0] ?? null;

  return {
    filedAt,
    claimAmount: fromBaseUnits(filedLog.args.claimAmount as bigint),
    evidenceHash: filedLog.args.evidenceHash as Hex,
    remainderReleased: fromBaseUnits(filedLog.args.remainderReleased as bigint),
    resolved: resolvedLog !== null,
    resolvedAt: resolvedLog ? await blockTimestampMs(resolvedLog.blockNumber) : null,
    landlordBps: resolvedLog ? Number(resolvedLog.args.landlordBps as number) : null,
    resolutionType: resolvedLog
      ? RESOLUTION_TYPE_LABEL[Number(resolvedLog.args.resolutionType as number)] ?? "arbitration"
      : null,
    releasedToLandlord: resolvedLog ? fromBaseUnits(resolvedLog.args.releasedToLandlord as bigint) : null,
    refundedToTenant: resolvedLog ? fromBaseUnits(resolvedLog.args.refundedToTenant as bigint) : null,
  };
}

export async function readPendingPeriods(leaseId: bigint): Promise<number> {
  const pending = await publicClient.readContract({
    address: requireEscrowAddress(),
    abi: rentPactEscrowAbi,
    functionName: "pendingPeriods",
    args: [leaseId],
  });
  return Number(pending);
}

// Arc testnet's RPC caps eth_getLogs to a 10,000-block range per call, so a
// wide fromBlock:0 query must be paged through in chunks and aggregated.
const LOG_QUERY_CHUNK_BLOCKS = 9_000n;

/** Re-scan this many trailing blocks past the saved cursor, in case a block
 * near the edge was still being reorganized when it was last scanned. */
const SCAN_OVERLAP_BLOCKS = 50n;

type ActivityEventName =
  | "LeaseCreated"
  | "LeaseSigned"
  | "TrancheReleased"
  | "DisputeRaised"
  | "DisputeResolved"
  | "LeaseCancelled"
  | "DepositClaimFiled"
  | "CautionReleased"
  | "CautionClaimResolved";

interface StoredLog {
  args: Record<string, unknown>;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}

// Event logs are append-only, so scans are cached incrementally in
// localStorage: each (event, filter) key remembers the logs found so far and
// the block it has scanned up to. The next call only scans the blocks minted
// since. Without this, every scan re-walked the whole history from the
// deploy block — ~44 sequential getLogs calls at Arc's 10,000-block cap and
// growing by ~20/day, against an RPC that only serves one request at a time.
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? { __bigint: value.toString() } : value;
}

function bigintReviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && "__bigint" in (value as Record<string, unknown>)) {
    return BigInt((value as { __bigint: string }).__bigint);
  }
  return value;
}

interface ScanCache {
  cursor: bigint;
  logs: StoredLog[];
}

function scanCacheKey(address: Address, eventName: string, args: Record<string, unknown> | undefined): string {
  return `rentpact:logscan:v1:${address}:${eventName}:${JSON.stringify(args ?? {}, bigintReplacer)}`;
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

/** Pages a getContractEvents query across Arc's 10,000-block eth_getLogs cap,
 * resuming from the last scanned block instead of re-walking full history. */
async function queryEventsChunked<T>(
  eventName: ActivityEventName,
  args: Record<string, unknown> | undefined,
  mapLog: (log: { args: Record<string, unknown>; transactionHash: Hex; blockNumber: bigint }) => T | null,
): Promise<T[]> {
  const address = requireEscrowAddress();
  const latestBlock = await publicClient.getBlockNumber();

  const key = scanCacheKey(address, eventName, args);
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
      abi: rentPactEscrowAbi,
      eventName,
      args,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const dedupeKey = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      storedLogs.push({
        args: (log.args ?? {}) as Record<string, unknown>,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      });
    }
  }

  writeScanCache(key, { cursor: latestBlock, logs: storedLogs });

  const results: T[] = [];
  for (const log of storedLogs) {
    const mapped = mapLog(log);
    if (mapped !== null) results.push(mapped);
  }
  return results;
}

/** Scans LeaseCreated logs for leases where `address` is the tenant or landlord. */
export async function findLeaseIdsForAddress(
  address: Address,
  role: "tenant" | "landlord",
): Promise<bigint[]> {
  return queryEventsChunked(
    "LeaseCreated",
    role === "tenant" ? { tenant: address } : { landlord: address },
    (log) => (log.args.leaseId !== undefined ? (log.args.leaseId as bigint) : null),
  );
}

export interface ReputationStats {
  completedAsTenant: number;
  completedAsLandlord: number;
  totalAsTenant: number;
  totalAsLandlord: number;
  disputesRaised: number;
  disputesWonAsTenant: number;
  disputesLostAsTenant: number;
  disputesPending: number;
}

/**
 * Computes a reputation score purely from real on-chain history — completed
 * leases and dispute outcomes scanned directly from contract events. Never
 * fabricated, never stored separately: re-derived fresh from the chain
 * every time, so it can't drift from what actually happened.
 */
export async function getReputationStats(address: Address): Promise<ReputationStats> {
  const [tenantLeaseIds, landlordLeaseIds] = await Promise.all([
    findLeaseIdsForAddress(address, "tenant"),
    findLeaseIdsForAddress(address, "landlord"),
  ]);

  const [tenantLeases, landlordLeases] = await Promise.all([
    Promise.all(tenantLeaseIds.map(readLease)),
    Promise.all(landlordLeaseIds.map(readLease)),
  ]);

  const isCompleted = (l: OnChainLease) => !l.cancelled && l.periodsReleased >= l.totalPeriods;

  const disputeRaisedLogs = await queryEventsChunked("DisputeRaised", { tenant: address }, (log) =>
    log.args.leaseId !== undefined && (log.args.reason as string) !== CAUTION_CLAIM_DISPUTE_REASON
      ? (log.args.leaseId as bigint)
      : null,
  );
  const raisedLeaseIdSet = new Set(disputeRaisedLogs.map((id) => id.toString()));

  const disputeResolvedLogs = await queryEventsChunked("DisputeResolved", undefined, (log) =>
    log.args.leaseId !== undefined
      ? { leaseId: log.args.leaseId as bigint, landlordBps: Number(log.args.landlordBps as number) }
      : null,
  );
  const ownResolutions = disputeResolvedLogs.filter((r) => raisedLeaseIdSet.has(r.leaseId.toString()));

  // "Won" = tenant kept the majority of the disputed funds (landlordBps < 50%).
  return {
    completedAsTenant: tenantLeases.filter(isCompleted).length,
    completedAsLandlord: landlordLeases.filter(isCompleted).length,
    totalAsTenant: tenantLeases.length,
    totalAsLandlord: landlordLeases.length,
    disputesRaised: disputeRaisedLogs.length,
    disputesWonAsTenant: ownResolutions.filter((r) => r.landlordBps < BPS_DENOMINATOR / 2).length,
    disputesLostAsTenant: ownResolutions.filter((r) => r.landlordBps >= BPS_DENOMINATOR / 2).length,
    disputesPending: disputeRaisedLogs.length - ownResolutions.length,
  };
}

export type ActivityType =
  | "deposit"
  | "signed"
  | "release"
  | "dispute-raised"
  | "settlement-proposed"
  | "dispute-resolved"
  | "cancelled"
  | "caution-claim-filed"
  | "caution-released"
  | "caution-claim-resolved";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  leaseId: string;
  timestamp: number;
  amount: number | null;
  txHash: string | null;
}

// Block timestamps are immutable, but the activity feed needs one per event —
// previously a fresh getBlock round trip each, on an RPC that serves one
// request at a time. Cached in memory + localStorage.
const BLOCK_TS_KEY = "rentpact:block-ts:v1";
const blockTsMemory = new Map<string, number>();
let blockTsLoaded = false;

function loadBlockTsCache() {
  if (blockTsLoaded || typeof window === "undefined") return;
  blockTsLoaded = true;
  try {
    const raw = window.localStorage.getItem(BLOCK_TS_KEY);
    if (!raw) return;
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) {
      blockTsMemory.set(k, v);
    }
  } catch {
    // ignore — cache rebuilds naturally
  }
}

async function blockTimestampMs(blockNumber: bigint): Promise<number> {
  loadBlockTsCache();
  const key = blockNumber.toString();
  const hit = blockTsMemory.get(key);
  if (hit !== undefined) return hit;

  const block = await publicClient.getBlock({ blockNumber });
  const ts = Number(block.timestamp) * 1000;
  blockTsMemory.set(key, ts);
  if (typeof window !== "undefined" && blockTsMemory.size <= 5000) {
    try {
      window.localStorage.setItem(BLOCK_TS_KEY, JSON.stringify(Object.fromEntries(blockTsMemory)));
    } catch {
      // quota — memory cache still applies
    }
  }
  return ts;
}

/**
 * Recent activity for a wallet — deposits, signatures, releases, disputes —
 * scanned directly from real contract events for the leases that address is
 * party to. Each item carries the real transaction hash, so it can link
 * straight to the Arc block explorer. Never fabricated or cached: re-scanned
 * on every call, same principle as getReputationStats above.
 */
type RawLog = { args: Record<string, unknown>; transactionHash: Hex; blockNumber: bigint };

async function buildActivityItems(logs: {
  created: RawLog[];
  signed: RawLog[];
  released: RawLog[];
  raised: RawLog[];
  resolved: RawLog[];
  cancelled: RawLog[];
  claimFiled?: RawLog[];
  cautionReleased?: RawLog[];
  claimResolved?: RawLog[];
}): Promise<ActivityItem[]> {
  const raw: { type: ActivityType; log: RawLog; amount: number | null }[] = [
    ...logs.created.map((log) => ({
      type: "deposit" as const,
      log,
      amount: fromBaseUnits(log.args.rentDeposited as bigint) + fromBaseUnits(log.args.cautionAmount as bigint),
    })),
    ...logs.signed.map((log) => ({ type: "signed" as const, log, amount: null })),
    ...logs.released.map((log) => ({
      type: "release" as const,
      log,
      amount: fromBaseUnits(log.args.amountReleased as bigint),
    })),
    ...logs.raised.map((log) => ({ type: "dispute-raised" as const, log, amount: null })),
    ...logs.resolved.map((log) => ({
      type: "dispute-resolved" as const,
      log,
      amount: fromBaseUnits(log.args.refundedToTenant as bigint) + fromBaseUnits(log.args.releasedToLandlord as bigint),
    })),
    ...logs.cancelled.map((log) => ({
      type: "cancelled" as const,
      log,
      amount: fromBaseUnits(log.args.refundedAmount as bigint),
    })),
    ...(logs.claimFiled ?? []).map((log) => ({
      type: "caution-claim-filed" as const,
      log,
      amount: fromBaseUnits(log.args.claimAmount as bigint),
    })),
    ...(logs.cautionReleased ?? []).map((log) => ({
      type: "caution-released" as const,
      log,
      amount: fromBaseUnits(log.args.amount as bigint),
    })),
    ...(logs.claimResolved ?? []).map((log) => ({
      type: "caution-claim-resolved" as const,
      log,
      amount: fromBaseUnits(log.args.refundedToTenant as bigint) + fromBaseUnits(log.args.releasedToLandlord as bigint),
    })),
  ];

  const items = await Promise.all(
    raw.map(async ({ type, log, amount }) => ({
      id: `${log.transactionHash}-${type}`,
      type,
      leaseId: (log.args.leaseId as bigint).toString(),
      timestamp: await blockTimestampMs(log.blockNumber),
      amount,
      txHash: log.transactionHash,
    })),
  );

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getActivityFeed(address: Address, limit: number): Promise<ActivityItem[]> {
  const [tenantLeaseIds, landlordLeaseIds] = await Promise.all([
    findLeaseIdsForAddress(address, "tenant"),
    findLeaseIdsForAddress(address, "landlord"),
  ]);
  const myLeaseIds = new Set([...tenantLeaseIds, ...landlordLeaseIds].map((id) => id.toString()));
  if (myLeaseIds.size === 0) return [];

  const keep = (log: RawLog): RawLog | null =>
    log.args.leaseId !== undefined && myLeaseIds.has((log.args.leaseId as bigint).toString()) ? log : null;

  const [createdAsTenant, createdAsLandlord, signed, released, raised, resolved, cancelled, claimFiled, cautionReleased, claimResolved] =
    await Promise.all([
      queryEventsChunked("LeaseCreated", { tenant: address }, keep),
      queryEventsChunked("LeaseCreated", { landlord: address }, keep),
      queryEventsChunked("LeaseSigned", undefined, keep),
      queryEventsChunked("TrancheReleased", undefined, keep),
      queryEventsChunked("DisputeRaised", undefined, keep),
      queryEventsChunked("DisputeResolved", undefined, keep),
      queryEventsChunked("LeaseCancelled", undefined, keep),
      queryEventsChunked("DepositClaimFiled", undefined, keep),
      queryEventsChunked("CautionReleased", undefined, keep),
      queryEventsChunked("CautionClaimResolved", undefined, keep),
    ]);

  const dedupedCreated = [
    ...createdAsTenant,
    ...createdAsLandlord.filter((log) => !createdAsTenant.some((t) => t.transactionHash === log.transactionHash)),
  ];

  const items = await buildActivityItems({
    created: dedupedCreated,
    signed,
    released,
    raised,
    resolved,
    cancelled,
    claimFiled,
    cautionReleased,
    claimResolved,
  });
  return items.slice(0, limit);
}

/**
 * Full on-chain event history for a single lease — the "on-chain proof"
 * panel. leaseId is indexed on every event, so this filters directly rather
 * than resolving a wallet's whole lease set first.
 */
export async function getLeaseActivity(leaseId: bigint): Promise<ActivityItem[]> {
  const args = { leaseId };
  const [created, signed, released, raised, resolved, cancelled, claimFiled, cautionReleased, claimResolved] =
    await Promise.all([
      queryEventsChunked("LeaseCreated", args, (log) => log),
      queryEventsChunked("LeaseSigned", args, (log) => log),
      queryEventsChunked("TrancheReleased", args, (log) => log),
      queryEventsChunked("DisputeRaised", args, (log) => log),
      queryEventsChunked("DisputeResolved", args, (log) => log),
      queryEventsChunked("LeaseCancelled", args, (log) => log),
      queryEventsChunked("DepositClaimFiled", args, (log) => log),
      queryEventsChunked("CautionReleased", args, (log) => log),
      queryEventsChunked("CautionClaimResolved", args, (log) => log),
    ]);
  return buildActivityItems({ created, signed, released, raised, resolved, cancelled, claimFiled, cautionReleased, claimResolved });
}
