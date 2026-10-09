"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardContent, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import { REVIEW_COMMENT_MAX, REVIEW_REVEAL_AFTER_MS, type ReviewRole } from "@/lib/reviewModel";
import { fetchLeaseReviewState, submitReview, type LeaseReviewState } from "@/lib/reviews";
import { StarInput } from "./StarInput";
import { ReviewItem } from "./ReviewList";

/**
 * Two-way review for one lease, from the viewer's side. Unlocks once the
 * first rent period is released; double-blind until both sides have reviewed
 * (or 14 days pass), so neither can read the other's before writing theirs.
 */
export function LeaseReviewCard({
  leaseId,
  viewerRole,
  counterpartyEmail,
  unlocked,
}: {
  leaseId: string;
  viewerRole: ReviewRole;
  counterpartyEmail: string;
  /** At least one rent period has been released (the tenant has moved in). */
  unlocked: boolean;
}) {
  const otherRole = viewerRole === "tenant" ? "landlord" : "tenant";
  const [state, setState] = useState<LeaseReviewState | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    fetchLeaseReviewState(leaseId).then(setState);
  }, [leaseId, unlocked]);

  if (!unlocked) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink">Review your {otherRole}</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Reviews unlock after the first rent release — once{" "}
            {viewerRole === "tenant" ? "you've moved in" : "your tenant has moved in"}.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state === undefined) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Choose a star rating first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const next = await submitReview({
        leaseId,
        rating,
        comment: comment.trim(),
        mockReviewee: MOCK_MODE ? { toEmail: counterpartyEmail, toRole: otherRole } : undefined,
      });
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your review.");
    } finally {
      setSubmitting(false);
    }
  };

  const mine = state?.mine ?? null;
  const theirs = state?.theirs ?? null;

  // Already reviewed — show it, plus theirs once both are revealed.
  if (mine) {
    const hidden = mine.publishedAt === null;
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink">Your review</h2>
          {hidden ? (
            <div className="mt-3 flex gap-3 rounded-md bg-cream-400 p-3 text-sm text-ink-muted">
              <LockIcon />
              <p>
                Submitted and sealed. It goes public when your {otherRole} reviews you, or on{" "}
                <span className="font-medium text-ink">
                  {formatDate(new Date(mine.createdAt + REVIEW_REVEAL_AFTER_MS), "long")}
                </span>{" "}
                — whichever comes first. Neither of you can read the other&apos;s review before writing your own.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">Public on your {otherRole}&apos;s profile.</p>
          )}
          <div className="mt-4">
            <ReviewItem review={mine} />
          </div>
          {theirs && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-ink">What your {otherRole} said about you</h3>
              <div className="mt-3">
                <ReviewItem review={theirs} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-ink">Review your {otherRole}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Helps future {viewerRole === "tenant" ? "tenants choose a landlord" : "landlords choose a tenant"}. Your
          review stays sealed until your {otherRole} reviews you too, or for 14 days.
        </p>
        {state?.counterpartReviewed && (
          <p className="mt-3 rounded-md bg-gold-50 px-3 py-2 text-sm text-gold-600">
            Your {otherRole} has already reviewed you — leave yours to see what they said.
          </p>
        )}
        {state === null && (
          <p className="mt-3 text-sm text-terracotta-500">Couldn&apos;t check your review status — refresh to try again.</p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          <StarInput value={rating} onChange={setRating} disabled={submitting} />
          <div>
            <textarea
              placeholder={
                viewerRole === "tenant"
                  ? "How was your landlord? Responsiveness, repairs, honesty… (optional)"
                  : "How was your tenant? Payments, care of the property, communication… (optional)"
              }
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
              rows={4}
              maxLength={REVIEW_COMMENT_MAX}
              disabled={submitting}
              className="w-full rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-ink-soft">
              {comment.length}/{REVIEW_COMMENT_MAX}
            </p>
          </div>
          {error && <p className="text-sm text-terracotta-500">{error}</p>}
          <Button onClick={handleSubmit} disabled={submitting || state === null} className="self-start">
            {submitting ? "Submitting…" : "Submit review"}
          </Button>
          <p className="text-xs text-ink-soft">One review per lease — it can&apos;t be edited after you submit.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-forest-400" aria-hidden>
      <rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
