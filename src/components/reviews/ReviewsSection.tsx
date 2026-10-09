"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Review, ReviewRole } from "@/lib/reviewModel";
import { StarRating } from "./StarRating";
import { ReviewItem } from "./ReviewList";

type Filter = "all" | ReviewRole;

function statsOf(reviews: Review[]) {
  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of reviews) {
    distribution[r.rating - 1]++;
    total += r.rating;
  }
  return { count: reviews.length, average: reviews.length ? total / reviews.length : 0, distribution };
}

/**
 * Profile reviews: overall score, star distribution, and a filter between
 * reviews received as a landlord (from tenants) and as a tenant (from
 * landlords) — so someone vetting a landlord reads what past tenants said.
 */
export function ReviewsSection({
  reviews,
  emptyText = "No reviews yet.",
}: {
  reviews: Review[] | null;
  emptyText?: string;
}) {
  const asLandlord = useMemo(() => (reviews ?? []).filter((r) => r.toRole === "landlord"), [reviews]);
  const asTenant = useMemo(() => (reviews ?? []).filter((r) => r.toRole === "tenant"), [reviews]);
  const hasBothRoles = asLandlord.length > 0 && asTenant.length > 0;
  const [filter, setFilter] = useState<Filter>("all");

  const visible = filter === "landlord" ? asLandlord : filter === "tenant" ? asTenant : reviews ?? [];
  const stats = statsOf(visible);
  const soleRole = !hasBothRoles && asLandlord.length > 0 ? "as a landlord" : !hasBothRoles && asTenant.length > 0 ? "as a tenant" : null;

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Reviews</p>
          {soleRole && <p className="text-xs text-ink-soft">Rated {soleRole}</p>}
        </div>

        {reviews === null ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : reviews.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{emptyText}</p>
        ) : (
          <>
            {hasBothRoles && (
              <div role="radiogroup" aria-label="Filter reviews" className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    { value: "all", label: "All", count: reviews.length },
                    { value: "landlord", label: "As landlord", count: asLandlord.length },
                    { value: "tenant", label: "As tenant", count: asTenant.length },
                  ] as const
                ).map((option) => {
                  const active = filter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFilter(option.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400",
                        active
                          ? "border-forest-500 bg-forest-500 text-cream-50"
                          : "border-forest-100 bg-cream-50 text-ink-muted hover:border-forest-300 hover:text-forest-500",
                      )}
                    >
                      {option.label} <span className={cn("tabular-nums", active ? "text-cream-100/80" : "text-ink-soft")}>{option.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex shrink-0 flex-col items-start sm:w-36">
                <p className="font-serif text-4xl leading-none text-ink tabular-nums">{stats.average.toFixed(1)}</p>
                <StarRating value={stats.average} size="md" className="mt-2" />
                <p className="mt-1.5 text-xs text-ink-soft">
                  {stats.count} review{stats.count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-1.5" aria-label="Rating breakdown">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = stats.distribution[star - 1];
                  const pct = stats.count ? (n / stats.count) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-right tabular-nums text-ink-soft">{star}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-400">
                        <div className="h-full rounded-full bg-gold-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-5 tabular-nums text-ink-soft">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {visible.map((r) => (
                <ReviewItem key={r.id} review={r} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
