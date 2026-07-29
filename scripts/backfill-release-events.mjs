/**
 * Backfills missing "release" rows into the activity_events feed. The app
 * records each tranche release into activity_events with a fire-and-forget
 * write at release time (leaseData.ts releaseTranche); when that write fails,
 * the release is on-chain but missing from the feed, so it never shows in
 * transaction history or the lease record. This reconstructs every release
 * from the chain and upserts the missing rows.
 *
 * Reads release logs from the Arcscan (Blockscout) API rather than the Arc RPC
 * — the RPC caps eth_getLogs at 10k blocks and rate-limits to ~1 request at a
 * time, so a full-history scan (~1M blocks since deploy) takes ~45 min; the
 * indexer returns the whole set in one call. We parse the raw topics/data
 * ourselves because the contract isn't verified on Arcscan, so its "decoded"
 * view guesses a wrong (but same-selector) ABI.
 *
 *   Dry run (default — writes nothing, just reports):
 *     node --env-file=.env.local scripts/backfill-release-events.mjs
 *   Apply:
 *     node --env-file=.env.local scripts/backfill-release-events.mjs --apply
 *
 * Idempotent: rows use the same id the app uses (`${txHash}-release`), so
 * re-running only fills genuine gaps and never duplicates existing rows.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const escrow = process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS;
const scanBase = process.env.ARCSCAN_API_BASE ?? "https://testnet.arcscan.app";

if (!supabaseUrl || !supabaseKey || !escrow) {
  console.error("Missing env — run with --env-file=.env.local");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const USDC_DECIMALS = 6;
// Money events to reconstruct. `amountWord` is the index of the 32-byte data
// word holding the USDC amount (base units).
//   TrancheReleased(leaseId, periodsReleased, amountReleased, totalReleased)
//   CautionReleased(leaseId, amount)
const HEALED_EVENTS = {
  "0x93be08d1fbf976af717307eec845a2147837d5eed255f8715e35898336f9e4d8": { type: "release", amountWord: 1 },
  "0x8af2865f2fb26a4160828c0c4b6831c26360e12a69fa9193331a59d7fbc7ad47": { type: "caution-released", amountWord: 0 },
};

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

/** Pull every log for the escrow contract, following Blockscout pagination. */
async function fetchAllLogs() {
  const all = [];
  let params = null;
  for (let page = 0; page < 200; page++) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(`${scanBase}/api/v2/addresses/${escrow}/logs${qs}`);
    if (!res.ok) throw new Error(`Arcscan ${res.status}: ${await res.text()}`);
    const body = await res.json();
    all.push(...(body.items ?? []));
    if (!body.next_page_params) break;
    params = body.next_page_params;
  }
  return all;
}

function word(dataHex, i) {
  // dataHex is 0x-prefixed, 32-byte words concatenated.
  const start = 2 + i * 64;
  return BigInt("0x" + dataHex.slice(start, start + 64));
}

async function main() {
  console.log(`Current escrow: ${escrow}`);
  console.log(`Indexer:        ${scanBase}`);
  console.log(APPLY ? ">>> APPLY MODE — rows WILL be written.\n" : ">>> DRY RUN — nothing will be written.\n");

  const logs = await fetchAllLogs();
  const healable = logs.filter((l) => HEALED_EVENTS[(l.topics?.[0] ?? "").toLowerCase()]);
  console.log(`Fetched ${logs.length} contract logs · ${healable.length} healable money events.\n`);

  // Group parsed events by lease id (topic[1] = indexed leaseId).
  const byLease = new Map();
  for (const l of healable) {
    const spec = HEALED_EVENTS[l.topics[0].toLowerCase()];
    const leaseId = BigInt(l.topics[1]).toString();
    const amount = Number(word(l.data, spec.amountWord)) / 10 ** USDC_DECIMALS;
    const txHash = l.transaction_hash;
    const timestamp = Date.parse(l.block_timestamp);
    const row = { id: `${txHash}-${spec.type}`, lease_id: leaseId, type: spec.type, timestamp, amount, tx_hash: txHash, landlord_bps: null, resolution_type: null };
    if (!byLease.has(leaseId)) byLease.set(leaseId, []);
    byLease.get(leaseId).push(row);
  }

  const { data: leaseRows, error } = await supabase.from("lease_metadata").select("lease_id").order("lease_id");
  if (error) throw error;
  const knownLeaseIds = new Set((leaseRows ?? []).map((r) => String(r.lease_id)));

  let totalInserted = 0;
  let totalAlready = 0;

  for (const [leaseId, rows] of [...byLease.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const ids = rows.map((r) => r.id);
    const { data: existing } = await supabase.from("activity_events").select("id").in("id", ids);
    const existingIds = new Set((existing ?? []).map((r) => r.id));
    const missing = rows.filter((r) => !existingIds.has(r.id));

    totalAlready += rows.length - missing.length;
    totalInserted += missing.length;

    const orphan = knownLeaseIds.has(leaseId) ? "" : "  [!] no lease_metadata row — won't map to an address feed";
    console.log(`Lease ${leaseId}: ${rows.length} money event(s) on-chain · ${rows.length - missing.length} already in feed · ${missing.length} to backfill${orphan}`);
    for (const r of missing.sort((a, b) => a.timestamp - b.timestamp)) {
      console.log(`    + ${r.type} ${r.amount.toFixed(2)} USDC  ${new Date(r.timestamp).toISOString().slice(0, 10)}  ${r.tx_hash}`);
    }

    if (APPLY && missing.length) {
      const { error: upErr } = await supabase.from("activity_events").upsert(missing, { onConflict: "id" });
      if (upErr) throw upErr;
    }
  }

  console.log(`\nTotal: ${totalAlready} already present, ${totalInserted} ${APPLY ? "backfilled" : "would be backfilled"}.`);
  if (!APPLY && totalInserted > 0) console.log("Re-run with --apply to write them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
