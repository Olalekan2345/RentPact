/**
 * Reconciles the off-chain tables (lease_metadata, activity_events) with the
 * CURRENT escrow contract after a redeploy. Two redeploys left rows for lease
 * ids that no longer exist on the live contract, plus rows with null/stale
 * addresses — which breaks the wallet -> lease -> activity mapping, so some
 * releases don't show in transaction history.
 *
 *   Dry run (default — deletes nothing, just reports):
 *     node --env-file=.env.local scripts/reconcile-offchain-data.mjs
 *   Apply:
 *     node --env-file=.env.local scripts/reconcile-offchain-data.mjs --apply
 *
 * For each lease_metadata row it checks whether that lease exists on the
 * current contract. If not -> the row and its activity_events are deleted
 * (dead data from an old deployment). If it does -> its tenant/landlord
 * addresses are refreshed from the chain, fixing nulls/staleness.
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

const APPLY = process.argv.includes("--apply");

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

// Full Lease tuple so viem decodes tenant/landlord correctly (the struct is
// dynamic — it contains a string — so a partial ABI mis-decodes it).
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

async function readLeaseParties(id) {
  try {
    const l = await publicClient.readContract({ address: escrow, abi: getLeaseAbi, functionName: "getLease", args: [BigInt(id)] });
    return { exists: true, tenant: l.tenant.toLowerCase(), landlord: l.landlord.toLowerCase() };
  } catch {
    return { exists: false };
  }
}

async function main() {
  console.log(`Current escrow: ${escrow}`);
  console.log(APPLY ? ">>> APPLY MODE — changes WILL be written.\n" : ">>> DRY RUN — nothing will be changed.\n");

  const { data: rows, error } = await supabase.from("lease_metadata").select("lease_id, tenant_address, landlord_address");
  if (error) throw error;

  const dead = [];
  const refresh = [];
  for (const row of rows ?? []) {
    const r = await readLeaseParties(row.lease_id);
    if (!r.exists) {
      dead.push(row.lease_id);
    } else {
      const changed = r.tenant !== row.tenant_address || r.landlord !== row.landlord_address;
      refresh.push({ lease_id: row.lease_id, tenant: r.tenant, landlord: r.landlord, changed });
    }
  }

  // Count activity_events that would be removed with the dead leases.
  let deadEventCount = 0;
  if (dead.length) {
    const { count } = await supabase.from("activity_events").select("*", { count: "exact", head: true }).in("lease_id", dead);
    deadEventCount = count ?? 0;
  }

  console.log(`KEEP — leases on the current contract (${refresh.length}):`);
  for (const r of refresh) {
    console.log(
      `  lease ${r.lease_id}: tenant ${r.tenant} · landlord ${r.landlord}` + (r.changed ? "   [addresses will be corrected]" : "   [already correct]"),
    );
  }
  console.log(`\nDELETE — dead leases not on the current contract (${dead.length}): ${dead.join(", ") || "(none)"}`);
  console.log(`  -> also removes ${deadEventCount} activity_events row(s) tied to those dead leases.`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to make these changes.");
    return;
  }

  for (const id of dead) {
    const { error: aErr } = await supabase.from("activity_events").delete().eq("lease_id", id);
    if (aErr) throw aErr;
    const { error: mErr } = await supabase.from("lease_metadata").delete().eq("lease_id", id);
    if (mErr) throw mErr;
    console.log(`deleted lease ${id} (metadata + activity)`);
  }
  for (const r of refresh.filter((x) => x.changed)) {
    const { error: uErr } = await supabase
      .from("lease_metadata")
      .update({ tenant_address: r.tenant, landlord_address: r.landlord })
      .eq("lease_id", r.lease_id);
    if (uErr) throw uErr;
    console.log(`refreshed addresses for lease ${r.lease_id}`);
  }
  console.log("\nDone — off-chain tables reconciled with the current contract.");
}

await main();
