import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  publishedAtFor,
  summarizeReviews,
  type Review,
  type ReviewRole,
  type ReviewSummary,
} from "@/lib/reviewModel";

/**
 * Mutual lease reviews. Who may write one is decided by
 * reviewEligibilityServer.ts (the real, signed-in party of an on-chain lease);
 * this module only stores and reads them.
 *
 * Double-blind is enforced HERE, server-side: every public read only returns
 * reviews whose publishedAt (see reviewModel.publishedAtFor) has passed. The
 * table itself is not publicly readable (migration 0012), so the API is the
 * only way to read reviews — a hidden review can't leak before its reveal.
 */

type ReviewRow = {
  id: string;
  lease_id: string;
  from_email: string;
  to_email: string;
  to_role: string | null;
  rating: number;
  comment: string;
  created_at: number;
};

const normalize = (email: string) => email.trim().toLowerCase();

function toRole(value: string | null): ReviewRole | null {
  return value === "tenant" || value === "landlord" ? value : null;
}

async function profilesByEmail(emails: string[]): Promise<Map<string, { name: string | null; photoUrl: string | null }>> {
  const unique = Array.from(new Set(emails));
  const map = new Map<string, { name: string | null; photoUrl: string | null }>();
  if (unique.length === 0) return map;
  const { data } = await supabaseAdmin().from("profiles").select("email, name, photo_url").in("email", unique);
  for (const row of data ?? []) map.set(row.email, { name: row.name, photoUrl: row.photo_url });
  return map;
}

/**
 * Builds Review objects (with publishedAt resolved) for `rows`, using
 * `counterpartRows` to know whether the reviewee has reviewed the same lease.
 */
async function hydrate(rows: ReviewRow[], counterpartRows: ReviewRow[]): Promise<Review[]> {
  const counterpartAt = new Map<string, number>();
  for (const c of counterpartRows) counterpartAt.set(`${c.lease_id}|${c.from_email}`, c.created_at);

  const profiles = await profilesByEmail(rows.map((r) => r.from_email));

  return rows.map((row) => {
    const profile = profiles.get(row.from_email);
    return {
      id: row.id,
      leaseId: row.lease_id,
      fromEmail: row.from_email,
      fromName: profile?.name ?? null,
      fromPhotoUrl: profile?.photoUrl ?? null,
      toEmail: row.to_email,
      toRole: toRole(row.to_role),
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
      publishedAt: publishedAtFor(row.created_at, counterpartAt.get(`${row.lease_id}|${row.to_email}`) ?? null),
    };
  });
}

/** Reviews written by `fromEmails` on any of `leaseIds` — the "has the other side reviewed too?" lookup. */
async function rowsAuthoredOn(fromEmails: string[], leaseIds: string[]): Promise<ReviewRow[]> {
  if (fromEmails.length === 0 || leaseIds.length === 0) return [];
  const { data } = await supabaseAdmin()
    .from("reviews")
    .select()
    .in("from_email", Array.from(new Set(fromEmails)))
    .in("lease_id", Array.from(new Set(leaseIds)));
  return data ?? [];
}

/** Published reviews about `email`, newest reveal first. */
export async function listPublishedReviewsForEmail(email: string): Promise<Review[]> {
  const normalized = normalize(email);
  const { data } = await supabaseAdmin().from("reviews").select().eq("to_email", normalized);
  const rows = data ?? [];
  const counterparts = await rowsAuthoredOn([normalized], rows.map((r) => r.lease_id));
  return (await hydrate(rows, counterparts))
    .filter((r) => r.publishedAt !== null)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
}

/** Per-role rating summaries for several users at once (listing cards, invite page). */
export async function getReviewSummaries(emails: string[]): Promise<Record<string, ReviewSummary>> {
  const normalized = Array.from(new Set(emails.map(normalize))).filter(Boolean);
  const result: Record<string, ReviewSummary> = {};
  if (normalized.length === 0) return result;

  const db = supabaseAdmin();
  const [{ data: reviewRows }, { data: prefRows }] = await Promise.all([
    db.from("reviews").select().in("to_email", normalized),
    db.from("privacy_prefs").select("email, show_reviews").in("email", normalized),
  ]);
  const rows = reviewRows ?? [];
  const counterparts = await rowsAuthoredOn(normalized, rows.map((r) => r.lease_id));
  const reviews = await hydrate(rows, counterparts);
  const hiddenEmails = new Set((prefRows ?? []).filter((p) => !p.show_reviews).map((p) => p.email));

  for (const email of normalized) {
    const hidden = hiddenEmails.has(email);
    result[email] = summarizeReviews(hidden ? [] : reviews.filter((r) => r.toEmail === email), hidden);
  }
  return result;
}

export interface LeaseReviewState {
  /** The viewer's own review of this lease — always visible to its author. */
  mine: Review | null;
  /** The other party's review of the viewer — only once it's published. */
  theirs: Review | null;
  /** Whether the other party has written theirs (shown as a nudge, never its content). */
  counterpartReviewed: boolean;
}

export async function getLeaseReviewState(leaseId: string, viewerEmail: string): Promise<LeaseReviewState> {
  const viewer = normalize(viewerEmail);
  const { data } = await supabaseAdmin().from("reviews").select().eq("lease_id", leaseId);
  const rows = data ?? [];
  const reviews = await hydrate(rows, rows);

  const mine = reviews.find((r) => r.fromEmail === viewer) ?? null;
  const theirsRaw = reviews.find((r) => r.toEmail === viewer) ?? null;
  return {
    mine,
    theirs: theirsRaw && theirsRaw.publishedAt !== null ? theirsRaw : null,
    counterpartReviewed: theirsRaw !== null,
  };
}

export async function hasReviewed(leaseId: string, fromEmail: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("reviews")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("from_email", normalize(fromEmail))
    .maybeSingle();
  return !!data;
}

export async function createReview(input: {
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  toRole: ReviewRole;
  rating: number;
  comment: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("reviews").insert({
    id: crypto.randomUUID(),
    lease_id: input.leaseId,
    from_email: normalize(input.fromEmail),
    to_email: normalize(input.toEmail),
    to_role: input.toRole,
    rating: input.rating,
    comment: input.comment,
    created_at: Date.now(),
  });
  if (error) throw error;
}
