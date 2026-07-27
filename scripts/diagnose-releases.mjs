/**
 * Read-only diagnostic: for every lease on the CURRENT contract, compare the
 * number of tranche releases on-chain (periodsReleased) against the number of
 * "release" rows recorded in the activity_events feed. Anything where on-chain
 * releases > recorded releases explains a transaction history that's missing
 * releases.
 *
 *   node --env-file=.env.local scripts/diagnose-releases.mjs
 *
 * Changes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL;
const chainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID);
const escrow = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;

if (!supabaseUrl || !supabaseKey || !rpcUrl || !chainId || !escrow) {
  console.error("Missing env — run with --env-file=.env.local");
  process.exit(1);
}

function retryingHttp(url) {
  const base = http(url);
  return (config) => {
    const transport = base(config);
    const original = transport.request.bind(transport);
    return {
      ...transport,
      request: async (params) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await original(params);
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            if (attempt < 8 && m.includes("request limit reached")) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
      },
    };
  };
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const publicClient = createPublicClient({
  chain: { id: chainId, name: "arc", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } },
  transport: retryingHttp(rpcUrl),
});

const getLeaseAbi = [
  {
    inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }],
    name: "getLease",
    outputs: [
      {
        components: [
          { internalType: "address", name: "tenant", type: "address" },
          { internalType: "address", name: "landlord", type: "address" },
          { internalType: "uint256", name: "amountPerPeriod", type: "uint256" },
          { internalType: "uint256", name: "totalPeriods", type: "uint256" },
          { internalType: "uint256", name: "periodsReleased", type: "uint256" },
          { internalType: "uint8", name: "frequency", type: "uint8" },
          { internalType: "uint256", name: "createdAt", type: "uint256" },
          { internalType: "uint256", name: "signedAt", type: "uint256" },
          { internalType: "bool", name: "signed", type: "bool" },
          { internalType: "bool", name: "cancelled", type: "bool" },
          { internalType: "bool", name: "disputeActive", type: "bool" },
          { internalType: "uint256", name: "disputeRaisedAt", type: "uint256" },
          { internalType: "string", name: "disputeReason", type: "string" },
          { internalType: "uint16", name: "settlementProposedBps", type: "uint16" },
          { internalType: "address", name: "settlementProposer", type: "address" },
          { internalType: "uint256", name: "repairCreditHeld", type: "uint256" },
          { internalType: "bool", name: "disputeIsCautionClaim", type: "bool" },
          { internalType: "uint256", name: "cautionAmount", type: "uint256" },
          { internalType: "uint256", name: "completedAt", type: "uint256" },
          { internalType: "uint256", name: "cautionClaimedAmount", type: "uint256" },
          { internalType: "bytes32", name: "cautionClaimEvidenceHash", type: "bytes32" },
          { internalType: "uint256", name: "cautionClaimFiledAt", type: "uint256" },
          { internalType: "bool", name: "cautionSettled", type: "bool" },
          { internalType: "bool", name: "completedNaturally", type: "bool" },
          { internalType: "uint256", name: "latePeriods", type: "uint256" },
          { internalType: "uint256", name: "disputesLostCount", type: "uint256" },
          { internalType: "uint256", name: "credentialTokenId", type: "uint256" },
        ],
        internalType: "struct RentPactEscrow.Lease",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

async function readLease(id) {
  try {
    return await publicClient.readContract({ address: escrow, abi: getLeaseAbi, functionName: "getLease", args: [BigInt(id)] });
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Current escrow: ${escrow}\n`);

  const { data: rows, error } = await supabase
    .from("lease_metadata")
    .select("lease_id, tenant_address, landlord_address")
    .order("lease_id");
  if (error) throw error;

  if (!rows?.length) {
    console.log("No lease_metadata rows at all — the address→lease mapping is empty, so NOTHING will show in transaction history.");
    return;
  }

  for (const row of rows) {
    const l = await readLease(row.lease_id);
    const { data: events } = await supabase
      .from("activity_events")
      .select("type, tx_hash, timestamp")
      .eq("lease_id", row.lease_id)
      .order("timestamp");

    const typeCounts = {};
    for (const e of events ?? []) typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
    const recordedReleases = typeCounts["release"] ?? 0;

    console.log(`── Lease ${row.lease_id} ────────────────────────────────`);
    if (!l) {
      console.log(`  NOT on the current contract (dead row — should have been reconciled).`);
    } else {
      const onChainReleases = Number(l.periodsReleased);
      console.log(`  tenant meta:   ${row.tenant_address}`);
      console.log(`  tenant chain:  ${l.tenant.toLowerCase()}  ${row.tenant_address === l.tenant.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
      console.log(`  landlord meta: ${row.landlord_address}`);
      console.log(`  landlord chain:${l.landlord.toLowerCase()}  ${row.landlord_address === l.landlord.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
      console.log(`  on-chain periodsReleased: ${onChainReleases}   recorded 'release' rows: ${recordedReleases}` +
        (onChainReleases > recordedReleases ? `   ✗ MISSING ${onChainReleases - recordedReleases} RELEASE(S)` : `   ✓`));
    }
    console.log(`  event types in feed: ${Object.keys(typeCounts).length ? JSON.stringify(typeCounts) : "(none)"}`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
