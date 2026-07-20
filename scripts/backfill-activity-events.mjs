/**
 * One-off backfill: scans RentPactEscrow's full event history once and
 * populates activity_events, so history that happened *before*
 * migrations 0006/0007 shipped doesn't just vanish from the fast feed (it
 * would otherwise show empty until new activity happens). Every event from
 * here on is recorded live by leaseData.ts — safe and idempotent to re-run
 * this any time, e.g. after 0007 added landlord_bps/resolution_type.
 *
 * Run locally (uses the service-role key; never ship this to the client):
 *   node --env-file=.env.local scripts/backfill-activity-events.mjs
 *
 * Idempotent: activity_events.id is `${txHash}-${type}`, upserted, so
 * re-running is safe and just re-writes the same rows.
 *
 * Queries run one chunk at a time, deliberately not in parallel — Arc's
 * testnet RPC serves roughly one in-flight request per client, and this
 * only needs to run once so there's no reason to fight that limit. Requests
 * still retry with backoff on "request limit reached" (same as the app's
 * arcFriendly() transport in rentPactEscrow.ts) since the public RPC can
 * reject even a single request if something else is using it concurrently
 * (e.g. a dev server left running).
 */
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, formatUnits } from "viem";

function retryingHttp(url) {
  const base = http(url);
  return (config) => {
    const transport = base(config);
    const originalRequest = transport.request.bind(transport);
    const request = async (params) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await originalRequest(params);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (attempt < 8 && message.includes("request limit reached")) {
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
    };
    return { ...transport, request };
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL;
const chainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID);
const escrowAddress = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;
const deployBlock = BigInt(process.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK ?? "0");

if (!supabaseUrl || !supabaseKey || !rpcUrl || !chainId || !escrowAddress) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_ARC_RPC_URL / NEXT_PUBLIC_ARC_CHAIN_ID / " +
      "NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS not set — run with --env-file=.env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const publicClient = createPublicClient({
  chain: { id: chainId, name: "arc", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } },
  transport: retryingHttp(rpcUrl),
});

const USDC_DECIMALS = 6;
const usdc = (v) => Number(formatUnits(v, USDC_DECIMALS));

const LOG_QUERY_CHUNK_BLOCKS = 9000n;

const EVENT_ABIS = {
  LeaseCreated: {
    type: "event",
    name: "LeaseCreated",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: true, name: "tenant", type: "address" },
      { indexed: true, name: "landlord", type: "address" },
      { indexed: false, name: "amountPerPeriod", type: "uint256" },
      { indexed: false, name: "totalPeriods", type: "uint256" },
      { indexed: false, name: "frequency", type: "uint8" },
      { indexed: false, name: "rentDeposited", type: "uint256" },
      { indexed: false, name: "cautionAmount", type: "uint256" },
    ],
  },
  LeaseSigned: {
    type: "event",
    name: "LeaseSigned",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: false, name: "signedAt", type: "uint256" },
    ],
  },
  TrancheReleased: {
    type: "event",
    name: "TrancheReleased",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: false, name: "periodsReleased", type: "uint256" },
      { indexed: false, name: "amountReleased", type: "uint256" },
      { indexed: false, name: "totalPeriodsReleased", type: "uint256" },
    ],
  },
  DisputeRaised: {
    type: "event",
    name: "DisputeRaised",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: true, name: "tenant", type: "address" },
      { indexed: false, name: "reason", type: "string" },
    ],
  },
  SettlementProposed: {
    type: "event",
    name: "SettlementProposed",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: true, name: "proposer", type: "address" },
      { indexed: false, name: "landlordBps", type: "uint16" },
    ],
  },
  DisputeResolved: {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: false, name: "landlordBps", type: "uint16" },
      { indexed: false, name: "releasedToLandlord", type: "uint256" },
      { indexed: false, name: "refundedToTenant", type: "uint256" },
      { indexed: false, name: "resolutionType", type: "uint8" },
    ],
  },
  DepositClaimFiled: {
    type: "event",
    name: "DepositClaimFiled",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: false, name: "claimAmount", type: "uint256" },
      { indexed: false, name: "evidenceHash", type: "bytes32" },
      { indexed: false, name: "remainderReleased", type: "uint256" },
    ],
  },
  CautionReleased: {
    type: "event",
    name: "CautionReleased",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  CautionClaimResolved: {
    type: "event",
    name: "CautionClaimResolved",
    inputs: [
      { indexed: true, name: "leaseId", type: "uint256" },
      { indexed: false, name: "landlordBps", type: "uint16" },
      { indexed: false, name: "releasedToLandlord", type: "uint256" },
      { indexed: false, name: "refundedToTenant", type: "uint256" },
      { indexed: false, name: "resolutionType", type: "uint8" },
    ],
  },
};

async function scanAllLogs(eventName) {
  const latestBlock = await publicClient.getBlockNumber();
  const logs = [];
  for (let fromBlock = deployBlock; fromBlock <= latestBlock; fromBlock += LOG_QUERY_CHUNK_BLOCKS) {
    const toBlock = fromBlock + LOG_QUERY_CHUNK_BLOCKS - 1n > latestBlock ? latestBlock : fromBlock + LOG_QUERY_CHUNK_BLOCKS - 1n;
    const chunk = await publicClient.getLogs({
      address: escrowAddress,
      event: EVENT_ABIS[eventName],
      fromBlock,
      toBlock,
    });
    logs.push(...chunk);
  }
  return logs;
}

const blockTsCache = new Map();
async function blockTimestampMs(blockNumber) {
  const key = blockNumber.toString();
  if (blockTsCache.has(key)) return blockTsCache.get(key);
  const block = await publicClient.getBlock({ blockNumber });
  const ts = Number(block.timestamp) * 1000;
  blockTsCache.set(key, ts);
  return ts;
}

const RESOLUTION_TYPE_LABEL = ["settlement", "arbitration", "auto-fallback"];

async function toActivityRow(log, type, amount, extra = {}) {
  return {
    id: `${log.transactionHash}-${type}`,
    lease_id: log.args.leaseId.toString(),
    type,
    timestamp: await blockTimestampMs(log.blockNumber),
    amount,
    tx_hash: log.transactionHash,
    landlord_bps: null,
    resolution_type: null,
    ...extra,
  };
}

async function main() {
  const rows = [];

  console.log("Scanning LeaseCreated…");
  for (const log of await scanAllLogs("LeaseCreated")) {
    rows.push(await toActivityRow(log, "deposit", usdc(log.args.rentDeposited) + usdc(log.args.cautionAmount)));
  }

  console.log("Scanning LeaseSigned…");
  for (const log of await scanAllLogs("LeaseSigned")) {
    rows.push(await toActivityRow(log, "signed", null));
  }

  console.log("Scanning TrancheReleased…");
  for (const log of await scanAllLogs("TrancheReleased")) {
    rows.push(await toActivityRow(log, "release", usdc(log.args.amountReleased)));
  }

  console.log("Scanning DisputeRaised…");
  for (const log of await scanAllLogs("DisputeRaised")) {
    rows.push(await toActivityRow(log, "dispute-raised", null));
  }

  console.log("Scanning SettlementProposed…");
  for (const log of await scanAllLogs("SettlementProposed")) {
    rows.push(await toActivityRow(log, "settlement-proposed", null, { landlord_bps: Number(log.args.landlordBps) }));
  }

  console.log("Scanning DisputeResolved…");
  for (const log of await scanAllLogs("DisputeResolved")) {
    rows.push(
      await toActivityRow(
        log,
        "dispute-resolved",
        usdc(log.args.releasedToLandlord) + usdc(log.args.refundedToTenant),
        {
          landlord_bps: Number(log.args.landlordBps),
          resolution_type: RESOLUTION_TYPE_LABEL[Number(log.args.resolutionType)] ?? null,
        },
      ),
    );
  }

  console.log("Scanning DepositClaimFiled…");
  for (const log of await scanAllLogs("DepositClaimFiled")) {
    rows.push(await toActivityRow(log, "caution-claim-filed", usdc(log.args.claimAmount)));
  }

  console.log("Scanning CautionReleased…");
  for (const log of await scanAllLogs("CautionReleased")) {
    rows.push(await toActivityRow(log, "caution-released", usdc(log.args.amount)));
  }

  console.log("Scanning CautionClaimResolved…");
  for (const log of await scanAllLogs("CautionClaimResolved")) {
    rows.push(
      await toActivityRow(
        log,
        "caution-claim-resolved",
        usdc(log.args.releasedToLandlord) + usdc(log.args.refundedToTenant),
        {
          landlord_bps: Number(log.args.landlordBps),
          resolution_type: RESOLUTION_TYPE_LABEL[Number(log.args.resolutionType)] ?? null,
        },
      ),
    );
  }

  if (rows.length === 0) {
    console.log("No on-chain activity found — nothing to backfill.");
    return;
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("activity_events").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    console.log(`Upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  console.log(`Done — ${rows.length} activity event(s) backfilled.`);
}

await main();
