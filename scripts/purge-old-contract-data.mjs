/**
 * Purges off-chain data left over from OLD contract deployments. Each redeploy
 * resets lease ids to 1, so an old lease "2" and the current lease "2" share a
 * key — their off-chain rows collide and the old ones surface as phantom
 * releases, doubled deposits, wrong messages, blocking reviews, etc.
 *
 * The current contract's on-chain history is the source of truth:
 *   - validTx  = every tx that emitted an event on the CURRENT escrow. We read
 *                this from event LOGS, not the /transactions list: Circle wallet
 *                calls reach the escrow as internal txs, so /transactions shows
 *                almost nothing, but every interaction still emits a log.
 *   - cutoff   = the current contract's first event time; nothing on it
 *                can predate that, so any lease-keyed row older than cutoff is
 *                from a previous deployment.
 *   - current  = lease ids that exist on the current contract (lease_metadata,
 *                already reconciled against the chain).
 *
 * Keep-rules (everything else is deleted in --apply):
 *   activity_events    : tx_hash ∈ validTx  (or null-tx but lease current & ≥ cutoff)
 *   lease_constitutions: lease current AND accepted_at  ≥ cutoff
 *   dispute_rulings    : lease current AND resolved_at  ≥ cutoff
 *   move_out_conditions: lease current AND declared_at  ≥ cutoff
 *   reviews            : lease current AND created_at   ≥ cutoff
 *   messages (lease)   : lease current AND created_at   ≥ cutoff  (listing-only msgs kept)
 *   lease_listing_links: lease current                            (no timestamp column)
 *
 * Untouched: listings, profiles, templates, notification_*, privacy_prefs,
 * wallet_transfers, lease_metadata (owned by reconcile-offchain-data.mjs).
 *
 *   Dry run (default):  node --env-file=.env.local scripts/purge-old-contract-data.mjs
 *   Apply:              node --env-file=.env.local scripts/purge-old-contract-data.mjs --apply
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
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function fetchAllLogs() {
  const all = [];
  let params = null;
  for (let page = 0; page < 500; page++) {
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

async function selectAll(table, cols) {
  const { data, error } = await supabase.from(table).select(cols);
  if (error) {
    console.log(`  (skipping ${table}: ${error.message})`);
    return null;
  }
  return data ?? [];
}

async function main() {
  console.log(`Current escrow: ${escrow}`);
  console.log(APPLY ? ">>> APPLY MODE — rows WILL be deleted.\n" : ">>> DRY RUN — nothing will be deleted.\n");

  const logs = await fetchAllLogs();
  if (logs.length === 0) {
    console.error("No event logs found for the current contract — refusing to run (would look like everything is stale).");
    process.exit(1);
  }
  const validTx = new Set(logs.map((l) => (l.transaction_hash ?? "").toLowerCase()));
  const logTimes = logs.map((l) => Date.parse(l.block_timestamp)).filter((n) => !Number.isNaN(n));
  const cutoff = Math.min(...logTimes) - 60 * 60 * 1000; // first contract event, minus 1h slack

  const meta = (await selectAll("lease_metadata", "lease_id")) ?? [];
  const current = new Set(meta.map((r) => String(r.lease_id)));

  console.log(`Current-contract txs (from logs): ${validTx.size}`);
  console.log(`Deploy cutoff:  ${new Date(cutoff).toISOString()} (rows older than this are from a previous deployment)`);
  console.log(`Current leases: ${[...current].sort((a, b) => Number(a) - Number(b)).join(", ") || "(none)"}\n`);

  const plans = []; // { table, deleteKeys: [{...pk}], describe }

  // activity_events — keep iff tx on the current contract (or null-tx but current & recent)
  {
    const rows = (await selectAll("activity_events", "id, lease_id, type, tx_hash, timestamp, amount")) ?? [];
    // Keep if the tx is a current-contract event, OR (fallback for any current
    // row whose action emitted no indexed log) it's a current lease after cutoff.
    const del = rows.filter((r) => {
      const txCurrent = r.tx_hash && validTx.has(r.tx_hash.toLowerCase());
      const leaseCurrent = current.has(String(r.lease_id)) && r.timestamp >= cutoff;
      return !(txCurrent || leaseCurrent);
    });
    report("activity_events", rows.length, del, (r) => `lease ${r.lease_id} ${r.type} ${r.amount ?? ""} ${new Date(r.timestamp).toISOString().slice(0, 10)} ${r.tx_hash ?? "(no tx)"}`);
    plans.push({ table: "activity_events", pk: ["id"], del });
  }

  // Timestamped, lease-keyed tables — keep iff lease current AND row ≥ cutoff
  const timed = [
    { table: "lease_constitutions", ts: "accepted_at", cols: "lease_id, version, accepted_at" },
    { table: "dispute_rulings", ts: "resolved_at", cols: "lease_id, resolved_at" },
    { table: "move_out_conditions", ts: "declared_at", cols: "lease_id, declared_at" },
    { table: "reviews", ts: "created_at", cols: "id, lease_id, from_email, to_email, rating, created_at" },
  ];
  for (const { table, ts, cols } of timed) {
    const rows = await selectAll(table, cols);
    if (rows === null) continue;
    const del = rows.filter((r) => !(current.has(String(r.lease_id)) && r[ts] >= cutoff));
    report(table, rows.length, del, (r) => `lease ${r.lease_id} ${new Date(r[ts]).toISOString().slice(0, 10)}${r.rating ? ` ${r.rating}★ ${r.from_email}→${r.to_email}` : ""}${r.version ? ` v${r.version}` : ""}`);
    const pk = table === "reviews" ? ["id"] : table === "dispute_rulings" ? ["lease_id", "resolved_at"] : ["lease_id"];
    plans.push({ table, pk, del });
  }

  // messages — only lease-scoped ones; listing inquiries (lease_id null) are kept
  {
    const rows = (await selectAll("messages", "id, lease_id, from_email, to_email, created_at, text")) ?? [];
    const del = rows.filter((r) => r.lease_id != null && !(current.has(String(r.lease_id)) && r.created_at >= cutoff));
    report("messages (lease-scoped)", rows.filter((r) => r.lease_id != null).length, del, (r) => `lease ${r.lease_id} ${new Date(r.created_at).toISOString().slice(0, 10)} ${r.from_email}: ${(r.text ?? "").slice(0, 30)}`);
    plans.push({ table: "messages", pk: ["id"], del });
  }

  // lease_listing_links — no timestamp; keep iff lease current
  {
    const rows = (await selectAll("lease_listing_links", "lease_id, listing_id")) ?? [];
    const del = rows.filter((r) => !current.has(String(r.lease_id)));
    report("lease_listing_links", rows.length, del, (r) => `lease ${r.lease_id} → listing ${r.listing_id}`);
    plans.push({ table: "lease_listing_links", pk: ["lease_id"], del });
  }

  const totalDel = plans.reduce((n, p) => n + p.del.length, 0);
  console.log(`\n${APPLY ? "Deleting" : "Would delete"} ${totalDel} row(s) total.`);

  if (!APPLY) {
    if (totalDel) console.log("Re-run with --apply to delete them.");
    return;
  }

  for (const { table, pk, del } of plans) {
    for (const row of del) {
      let q = supabase.from(table).delete();
      for (const k of pk) q = q.eq(k, row[k]);
      const { error } = await q;
      if (error) throw new Error(`${table} delete failed: ${error.message}`);
    }
    if (del.length) console.log(`  deleted ${del.length} from ${table}`);
  }
  console.log("Done.");
}

function report(label, total, del, describe) {
  console.log(`── ${label}: ${total} row(s), ${del.length} stale ──`);
  for (const r of del.slice(0, 30)) console.log(`    ✗ ${describe(r)}`);
  if (del.length > 30) console.log(`    … and ${del.length - 30} more`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
