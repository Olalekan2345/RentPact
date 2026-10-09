import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { Review } from "@/lib/reviewModel";
import { StarRating } from "./StarRating";

function initialsOf(review: Review): string {
  const source = review.fromName?.trim() || review.fromEmail;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function ReviewItem({ review }: { review: Review }) {
  const name = review.fromName?.trim() || review.fromEmail;
  const reviewerRole = review.toRole === "landlord" ? "Tenant" : review.toRole === "tenant" ? "Landlord" : null;

  return (
    <article className="rounded-lg border border-forest-100 bg-cream-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest-50 text-xs font-semibold text-forest-500">
          {review.fromPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.fromPhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsOf(review)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Link
              href={`/u/${encodeURIComponent(review.fromEmail)}`}
              className="truncate text-sm font-semibold text-ink hover:text-forest-500 hover:underline"
            >
              {name}
            </Link>
            <StarRating value={review.rating} size="sm" />
          </div>
          {/* No separator before the verified chip, so a wrapped line never ends on a dangling "·". */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
            <span>
              {reviewerRole && `${reviewerRole} · `}
              {formatDate(new Date(review.publishedAt ?? review.createdAt))}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-forest-400">
              <CheckIcon />
              Verified lease
            </span>
          </p>
        </div>
      </div>
      {review.comment && (
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-ink-muted">{review.comment}</p>
      )}
    </article>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
