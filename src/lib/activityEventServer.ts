import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Fast path for the activity feed (dashboard bell, wallet transactions,
 * wallet earnings) — see supabase/migrations/0006_activity_events.sql for
 * why this exists. leaseData.ts records one row here right after each
 * mutation it already knows succeeded; this module only ever reads/writes
 * that record, never derives it from the chain itself.
 */
export type ActivityType =
  | "deposit"
  | "signed"
  | "release"
  | "dispute-raised"
  | "dispute-resolved"
  | "caution-claim-filed"
  | "caution-released"
  | "caution-claim-resolved";

export type ResolutionType = "settlement" | "arbitration" | "auto-fallback";

export interface ActivityEvent {
  id: string;
  leaseId: string;
  type: ActivityType;
  timestamp: number;
  amount: number | null;
  txHash: string | null;
  /** Only set for dispute-resolved/caution-claim-resolved rows — see migration 0007. */
  landlordBps: number | null;
  resolutionType: ResolutionType | null;
}

function fromRow(row: {
  id: string;
  lease_id: string;
  type: string;
  timestamp: number;
  amount: number | null;
  tx_hash: string | null;
  landlord_bps: number | null;
  resolution_type: string | null;
}): ActivityEvent {
  return {
    id: row.id,
    leaseId: row.lease_id,
    type: row.type as ActivityType,
    timestamp: row.timestamp,
    amount: row.amount,
    txHash: row.tx_hash,
    landlordBps: row.landlord_bps,
    resolutionType: row.resolution_type as ResolutionType | null,
  };
}

/** Idempotent by id (`${txHash}-${type}`) — safe to call more than once for the same event. */
export async function recordActivityEvent(event: ActivityEvent): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("activity_events")
    .upsert(
      {
        id: event.id,
        lease_id: event.leaseId,
        type: event.type,
        timestamp: event.timestamp,
        amount: event.amount,
        tx_hash: event.txHash,
        landlord_bps: event.landlordBps,
        resolution_type: event.resolutionType,
      },
      { onConflict: "id" },
    );
  if (error) throw error;
}

/** All recorded events for one lease — used by the dispute panel instead of an address-wide fetch. */
export async function getActivityFeedForLease(leaseId: string): Promise<ActivityEvent[]> {
  const { data } = await supabaseAdmin()
    .from("activity_events")
    .select()
    .eq("lease_id", leaseId)
    .order("timestamp", { ascending: false });

  return (data ?? []).map(fromRow);
}

export async function getActivityFeedForAddress(address: string, limit: number): Promise<ActivityEvent[]> {
  const normalized = address.trim().toLowerCase();

  const { data: leaseRows } = await supabaseAdmin()
    .from("lease_metadata")
    .select("lease_id")
    .or(`tenant_address.eq.${normalized},landlord_address.eq.${normalized}`);

  const leaseIds = (leaseRows ?? []).map((r) => r.lease_id);
  if (leaseIds.length === 0) return [];

  const { data } = await supabaseAdmin()
    .from("activity_events")
    .select()
    .in("lease_id", leaseIds)
    .order("timestamp", { ascending: false })
    .limit(limit);

  return (data ?? []).map(fromRow);
}
