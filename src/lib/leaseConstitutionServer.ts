import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Records which version (and exact hash) of the Constitution was active
 * when a given lease was created — Preamble: "recorded for every lease,
 * making the version each party agreed to permanent and verifiable." Not
 * stored on the smart contract (it predates this document and has no field
 * for it); this is the off-chain record described in Article VIII.4.
 */

export interface LeaseConstitutionRecord {
  leaseId: string;
  version: string;
  hash: string;
  acceptedAt: number;
}

export async function recordLeaseConstitution(input: LeaseConstitutionRecord): Promise<void> {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("lease_constitutions")
    .select("lease_id")
    .eq("lease_id", input.leaseId)
    .maybeSingle();
  if (existing) return;

  const { error } = await db.from("lease_constitutions").insert({
    lease_id: input.leaseId,
    version: input.version,
    hash: input.hash,
    accepted_at: input.acceptedAt,
  });
  if (error) throw error;
}

export async function getLeaseConstitution(leaseId: string): Promise<LeaseConstitutionRecord | null> {
  const { data } = await supabaseAdmin()
    .from("lease_constitutions")
    .select()
    .eq("lease_id", leaseId)
    .maybeSingle();
  if (!data) return null;
  return { leaseId: data.lease_id, version: data.version, hash: data.hash, acceptedAt: data.accepted_at };
}
