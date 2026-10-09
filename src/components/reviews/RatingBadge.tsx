import { cn } from "@/lib/utils";
import type { ReviewRole, ReviewSummary, RoleSummary } from "@/lib/reviewModel";
import { StarIcon } from "./StarRating";

/**
 * Picks one role's summary out of a batch fetch:
 *   undefined → still loading, null → the user hides their reviews.
 */
export function roleSummaryOf(
  summaries: Record<string, ReviewSummary> | undefined,
  email: string | null | undefined,
  role: ReviewRole,
): RoleSummary | null | undefined {
  if (summaries === undefined || !email) return undefined;
  const summary = summaries[email.trim().toLowerCase()];
  if (!summary) return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
  if (summary.hidden) return null;
  return role === "landlord" ? summary.asLandlord : summary.asTenant;
}

/** Compact "★ 4.8 (12)" — the at-a-glance signal on cards, rows and headers. */
export function RatingBadge({
  summary,
  emptyLabel = "No reviews yet",
  className,
}: {
  summary: RoleSummary | null | undefined;
  /** Shown when there are no reviews; pass null to render nothing instead. */
  emptyLabel?: string | null;
  className?: string;
}) {
  if (summary === undefined) {
    return <span className={cn("inline-block h-4 w-14 animate-pulse rounded bg-cream-400", className)} aria-hidden />;
  }
  if (summary === null) return null;
  if (summary.count === 0) {
    return emptyLabel ? <span className={cn("text-xs text-ink-soft", className)}>{emptyLabel}</span> : null;
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", className)}
      aria-label={`Rated ${summary.average.toFixed(1)} out of 5 from ${summary.count} review${summary.count === 1 ? "" : "s"}`}
    >
      <StarIcon className="h-3.5 w-3.5 shrink-0 text-gold-400" />
      <span className="font-semibold tabular-nums text-ink">{summary.average.toFixed(1)}</span>
      <span className="tabular-nums text-ink-soft">({summary.count})</span>
    </span>
  );
}
