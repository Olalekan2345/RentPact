import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Mutual post-lease reviews. Visible to any viewer, not just the reviewer's
 * own browser. Only unlockable once a lease is actually completed (checked
 * against real on-chain state by the API route before accepting a review, in
 * real mode).
 */

export interface Review {
  id: string;
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  rating: number;
  comment: string;
  createdAt: number;
}

function fromRow(row: {
  id: string;
  lease_id: string;
  from_email: string;
  to_email: string;
  rating: number;
  comment: string;
  created_at: number;
}): Review {
  return {
    id: row.id,
    leaseId: row.lease_id,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export async function listReviewsForEmail(email: string): Promise<Review[]> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("reviews")
    .select()
    .eq("to_email", normalized)
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromRow);
}

export async function hasReviewed(leaseId: string, fromEmail: string): Promise<boolean> {
  const normalized = fromEmail.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("reviews")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("from_email", normalized)
    .maybeSingle();
  return !!data;
}

export async function createReview(input: Omit<Review, "id" | "createdAt">): Promise<Review> {
  const review: Review = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };

  const { error } = await supabaseAdmin().from("reviews").insert({
    id: review.id,
    lease_id: review.leaseId,
    from_email: review.fromEmail,
    to_email: review.toEmail,
    rating: review.rating,
    comment: review.comment,
    created_at: review.createdAt,
  });
  if (error) throw error;

  return review;
}
