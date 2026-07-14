import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The arbiter's written reasoning for a dispute resolution — Article 4.4:
 * "Every ruling must include written reasoning, recorded alongside the
 * ruling." Not stored on-chain (the contract only records the landlordBps
 * split and resolution type); this is the off-chain record, hashed the same
 * way the Constitution and condition declarations are so tampering after
 * the fact is detectable even without a contract change. Auto-fallback
 * resolutions get a fixed system reasoning rather than a fabricated one.
 */

export interface DisputeRulingRecord {
  leaseId: string;
  resolvedAt: number;
  reasoning: string;
  hash: string;
}

function fromRow(row: { lease_id: string; resolved_at: number; reasoning: string; hash: string }): DisputeRulingRecord {
  return { leaseId: row.lease_id, resolvedAt: row.resolved_at, reasoning: row.reasoning, hash: row.hash };
}

export async function recordDisputeRuling(input: {
  leaseId: string;
  resolvedAt: number;
  reasoning: string;
}): Promise<DisputeRulingRecord> {
  const hash = crypto.createHash("sha256").update(input.reasoning, "utf-8").digest("hex");
  const record: DisputeRulingRecord = { ...input, hash };

  const { error } = await supabaseAdmin().from("dispute_rulings").upsert(
    {
      lease_id: record.leaseId,
      resolved_at: record.resolvedAt,
      reasoning: record.reasoning,
      hash: record.hash,
    },
    { onConflict: "lease_id,resolved_at" },
  );
  if (error) throw error;

  return record;
}

export async function getDisputeRuling(leaseId: string, resolvedAt: number): Promise<DisputeRulingRecord | null> {
  const { data } = await supabaseAdmin()
    .from("dispute_rulings")
    .select()
    .eq("lease_id", leaseId)
    .eq("resolved_at", resolvedAt)
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function getDisputeRulingsForLease(leaseId: string): Promise<DisputeRulingRecord[]> {
  const { data } = await supabaseAdmin().from("dispute_rulings").select().eq("lease_id", leaseId);
  return (data ?? []).map(fromRow);
}
