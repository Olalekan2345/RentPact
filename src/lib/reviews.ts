"use client";

export interface Review {
  id: string;
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export async function fetchReviewsFor(email: string): Promise<Review[]> {
  const res = await fetch(`/api/reviews?forEmail=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.reviews ?? [];
}

export interface CreateReviewInput {
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  rating: number;
  comment: string;
}

export async function submitReview(input: CreateReviewInput): Promise<Review> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not submit review.");
  }
  const json = await res.json();
  return json.review;
}
