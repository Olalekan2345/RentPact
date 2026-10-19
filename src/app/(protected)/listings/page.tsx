"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PropertyImage } from "@/components/PropertyImage";
import { EmptyState } from "@/components/EmptyState";
import { Badge, Skeleton } from "@/components/ui";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { formatUSDC } from "@/lib/format";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { fetchActiveListings, type Listing } from "@/lib/listings";
import { fetchReviewSummaries, type ReviewSummary, type RoleSummary } from "@/lib/reviews";
import { RatingBadge, roleSummaryOf } from "@/components/reviews";
import { ListingVerificationBadge, VerifiedLandlordBadge } from "@/components/verification/VerificationBadge";

export default function BrowseListingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [landlordSummaries, setLandlordSummaries] = useState<Record<string, ReviewSummary> | undefined>(undefined);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchActiveListings().then((loaded) => {
      setListings(loaded);
      // One batched request for every landlord on the page, not one per card.
      fetchReviewSummaries(loaded.map((l) => l.landlordEmail)).then(setLandlordSummaries);
    });
  }, [session]);

  if (isLoading || !session) return null;

  return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Find a place to rent</h1>
        <p className="mt-1 text-ink-muted">
          Every listing here is escrow-protected the moment you deposit. Verified listings have been checked by RentPact.
        </p>

        <div className="mt-8">
          {listings === null ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : listings.length === 0 ? (
            <EmptyState
              title="No listings yet"
              body="When a landlord publishes a property, it will show up here for tenants to rent."
              ctaLabel="List a property"
              ctaHref="/listings/new"
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  landlordRating={roleSummaryOf(landlordSummaries, listing.landlordEmail, "landlord")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
  );
}

function ListingCard({
  listing,
  landlordRating,
}: {
  listing: Listing;
  landlordRating: RoleSummary | null | undefined;
}) {
  const frequencyLabel =
    FREQUENCY_OPTIONS.find((f) => f.value === listing.frequency)?.label ?? listing.frequency;
  const totalEscrow = listing.amountPerPeriod * listing.totalPeriods + (listing.securityDeposit ?? 0);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group block overflow-hidden rounded-lg border border-forest-100/60 bg-cream-100 shadow-card transition-shadow hover:shadow-lifted"
    >
      <div className="relative">
        <PropertyImage
          seed={listing.id}
          propertyType={listing.propertyType}
          overrideUrl={listing.photoUrl}
          alt={listing.propertyAddress}
          className="h-40 w-full"
        />
        <ListingVerificationBadge status={listing.verificationStatus} className="absolute left-3 top-3 shadow-soft" />
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-lg text-ink">{listing.propertyAddress}</h3>
          <Badge variant="forest" className="shrink-0 capitalize">
            {listing.propertyType}
          </Badge>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
          Landlord
          {listing.landlordVerified && <VerifiedLandlordBadge />}
          <RatingBadge summary={landlordRating} emptyLabel="New · no reviews yet" />
        </p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 font-semibold text-ink">
            <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
            {formatUSDC(listing.amountPerPeriod)} <span className="text-ink-soft">USDC / period</span>
          </span>
          <span className="text-ink-soft">{frequencyLabel}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-forest-100/60 pt-3 text-xs">
          <span className="text-ink-soft">
            {listing.totalPeriods} period{listing.totalPeriods === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1 font-medium text-ink">
            <UsdcIcon className="h-3 w-3 shrink-0" />
            {formatUSDC(totalEscrow)} <span className="font-normal text-ink-soft">to escrow</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
