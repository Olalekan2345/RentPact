import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Move-out condition record — the counterpart to a listing's Property
 * Condition Declaration (the move-in baseline), filed once a lease
 * completes. Photos are hashed the same way as the move-in declaration, so
 * a deposit dispute can compare a real before/after rather than one party's
 * word against the other's. One record per lease; immutable once filed.
 */

export interface MoveOutPhoto {
  room: string;
  url: string;
  hash: string;
}

export interface MoveOutCondition {
  leaseId: string;
  submittedBy: string;
  notes: string;
  photos: MoveOutPhoto[];
  declaredAt: number;
  hash: string;
}

function fromRow(row: {
  lease_id: string;
  submitted_by: string;
  notes: string;
  photos: unknown;
  declared_at: number;
  hash: string;
}): MoveOutCondition {
  return {
    leaseId: row.lease_id,
    submittedBy: row.submitted_by,
    notes: row.notes,
    photos: row.photos as MoveOutPhoto[],
    declaredAt: row.declared_at,
    hash: row.hash,
  };
}

export async function getMoveOutCondition(leaseId: string): Promise<MoveOutCondition | null> {
  const { data } = await supabaseAdmin().from("move_out_conditions").select().eq("lease_id", leaseId).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function createMoveOutCondition(input: MoveOutCondition): Promise<MoveOutCondition> {
  // Rely on lease_id being the primary key for real atomicity (the old fs-based
  // check-then-write had a race the JSON file couldn't prevent; Postgres can).
  const { error } = await supabaseAdmin().from("move_out_conditions").insert({
    lease_id: input.leaseId,
    submitted_by: input.submittedBy,
    notes: input.notes,
    photos: input.photos,
    declared_at: input.declaredAt,
    hash: input.hash,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("A move-out condition has already been filed for this lease.");
    }
    throw error;
  }

  return input;
}
