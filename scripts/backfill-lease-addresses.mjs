/**
 * One-off backfill: populate lease_metadata.tenant_address / landlord_address
 * for rows created before migration 0005 added those columns. Reads each
 * lease's tenant/landlord straight from the deployed RentPactEscrow contract.
 *
 * Run locally (uses the service-role key; never ship this to the client):
 *   node --env-file=.env.local scripts/backfill-lease-addresses.mjs
 *
 * Idempotent: rows that already have both addresses are skipped.
 */
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL;
const chainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID);
const escrowAddress = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;

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
  transport: http(rpcUrl),
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

async function main() {
  const { data: rows, error } = await supabase
    .from("lease_metadata")
    .select("lease_id, tenant_address, landlord_address")
    .or("tenant_address.is.null,landlord_address.is.null");
  if (error) throw error;

  if (!rows || rows.length === 0) {
    console.log("Nothing to backfill — every row already has addresses.");
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const lease = await publicClient.readContract({
      address: escrowAddress,
      abi: getLeaseAbi,
      functionName: "getLease",
      args: [BigInt(row.lease_id)],
    });

    const { error: updateError } = await supabase
      .from("lease_metadata")
      .update({
        tenant_address: lease.tenant.toLowerCase(),
        landlord_address: lease.landlord.toLowerCase(),
      })
      .eq("lease_id", row.lease_id);
    if (updateError) throw updateError;

    updated++;
    console.log(`lease_metadata ${row.lease_id}: backfilled (tenant=${lease.tenant}, landlord=${lease.landlord})`);
  }

  console.log(`Done — ${updated} row(s) backfilled.`);
}

await main();
