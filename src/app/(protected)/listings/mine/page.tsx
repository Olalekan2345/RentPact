"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PropertyImage } from "@/components/PropertyImage";
import { EmptyState } from "@/components/EmptyState";
import { UsdcAmount } from "@/components/UsdcAmount";
import { Badge, Button, Skeleton } from "@/components/ui";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { fetchListingsForLandlord, type Listing } from "@/lib/listings";

export default function MyPropertiesPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchListingsForLandlord(session.email).then(setListings);
  }, [session]);

  if (isLoading || !session) return null;

  const liveCount = listings?.filter((l) => l.active).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Link href="/profile" className="text-sm text-forest-500 underline underline-offset-4">
            ← Profile
          </Link>
          <h1 className="mt-2 text-3xl text-ink">My properties</h1>
          {listings !== null && listings.length > 0 && (
            <p className="mt-1 text-sm text-ink-muted">
              {liveCount} live · {listings.length} total
            </p>
          )}
        </div>
        <Link href="/listings/new">
          <Button size="sm">List a property</Button>
        </Link>
      </div>

      <div className="mt-8">
        {listings === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            title="No properties yet"
            body="List a property and it becomes escrow-protected the moment a tenant deposits."
            ctaLabel="List a property"
            ctaHref="/listings/new"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {listings.map((listing) => {
              const frequencyLabel =
                FREQUENCY_OPTIONS.find((f) => f.value === listing.frequency)?.label ?? listing.frequency;
              return (
                <div
                  key={listing.id}
                  className="flex items-center gap-4 rounded-lg border border-forest-100 bg-cream-100 p-4"
                >
                  <Link
                    href={`/listings/${listing.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 transition-opacity hover:opacity-80"
                  >
                    <PropertyImage
                      seed={listing.id}
                      propertyType={listing.propertyType}
                      overrideUrl={listing.photoUrl}
                      alt={listing.propertyAddress}
                      className="h-16 w-16 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{listing.propertyAddress}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">
                        <UsdcAmount amount={listing.amountPerPeriod} iconSize={12} /> / period · {frequencyLabel}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-ink-soft">{listing.propertyType}</p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge variant={listing.active ? "forest" : "neutral"}>
                      {listing.active ? "Live" : "Rented"}
                    </Badge>
                    {!listing.active && (
                      <Link href={`/listings/new?from=${listing.id}`}>
                        <Button size="sm" variant="secondary">
                          List again
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
