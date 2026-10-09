"use client";

import type { Review, ReviewRole, ReviewSummary } from "@/lib/reviewModel";

export type { Review, ReviewRole, ReviewSummary, RoleSummary } from "@/lib/reviewModel";

/** Published reviews about `email` (double-blind hidden ones are never returned). */
export async function fetchReviewsFor(email: string): Promise<Review[]> {
  const res = await fetch(`/api/reviews?forEmail=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.reviews ?? [];
}

/** Per-role rating summaries keyed by lowercased email. */
export async function fetchReviewSummaries(emails: string[]): Promise<Record<string, ReviewSummary>> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (unique.length === 0) return {};
  const res = await fetch(`/api/reviews/summary?emails=${encodeURIComponent(unique.join(","))}`);
  if (!res.ok) return {};
  const json = await res.json();
  return json.summaries ?? {};
}

export interface LeaseReviewState {
  mine: Review | null;
  theirs: Review | null;
  counterpartReviewed: boolean;
}

export async function fetchLeaseReviewState(leaseId: string): Promise<LeaseReviewState | null> {
  const res = await fetch(`/api/reviews/lease?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.state ?? null;
}

export interface SubmitReviewInput {
  leaseId: string;
  rating: number;
  comment: string;
  /**
   * Only read by the server in mock mode (leases live in the browser there).
   * In real mode the reviewee is derived from the lease and these are ignored.
   */
  mockReviewee?: { toEmail: string; toRole: ReviewRole };
}

export async function submitReview(input: SubmitReviewInput): Promise<LeaseReviewState> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leaseId: input.leaseId,
      rating: input.rating,
      comment: input.comment,
      ...input.mockReviewee,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Could not submit your review.");
  return json.state;
}
