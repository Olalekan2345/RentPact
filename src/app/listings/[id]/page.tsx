"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { PropertyImage } from "@/components/PropertyImage";
import { ConditionDeclarationView } from "@/components/ConditionDeclarationView";
import { Badge, Button, Card, CardContent, Skeleton } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { fetchListing, deactivateListing, type Listing } from "@/lib/listings";
import type { LeaseDraft } from "@/lib/leaseDraft";
import { useCautionFeeLabel } from "@/lib/cautionFee";
import { getCautionReturnRate, type CautionReturnRate } from "@/lib/leaseData";

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [deactivating, setDeactivating] = useState(false);
  const [cautionReturnRate, setCautionReturnRate] = useState<CautionReturnRate | null | undefined>(undefined);
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    fetchListing(id).then(setListing);
  }, [id]);

  useEffect(() => {
    if (!listing || !listing.landlordAddress) return;
    getCautionReturnRate({ email: listing.landlordEmail, address: listing.landlordAddress }).then(setCautionReturnRate);
  }, [listing]);

  if (isLoading || !session || listing === undefined) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (listing === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">Listing not found.</div>
      </AppShell>
    );
  }

  const isOwnListing = listing.landlordEmail === session.email;
  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === listing.frequency)?.label ?? listing.frequency;
  const total = listing.amountPerPeriod * listing.totalPeriods;

  const handleRent = () => {
    const draft: LeaseDraft = {
      propertyAddress: listing.propertyAddress,
      propertyType: listing.propertyType,
      photoUrl: listing.photoUrl,
      landlordEmail: listing.landlordEmail,
      landlordAddress: listing.landlordAddress,
      amountPerPeriod: listing.amountPerPeriod,
      totalPeriods: listing.totalPeriods,
      frequency: listing.frequency,
      cautionAmount: listing.securityDeposit ?? 0,
    };
    window.sessionStorage.setItem("rentpact:lease-draft", JSON.stringify(draft));
    window.sessionStorage.setItem("rentpact:listing-id", listing.id);
    router.push("/leases/new/deposit");
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await deactivateListing(listing.id);
      router.push("/dashboard");
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <AppShell>
      <div className="pb-16">
        <div className="relative">
          <PropertyImage
            seed={listing.id}
            propertyType={listing.propertyType}
            overrideUrl={listing.photoUrl}
            alt={listing.propertyAddress}
            className="h-56 w-full sm:h-72"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/40 to-transparent" />
        </div>

        <div className="mx-auto -mt-6 max-w-lg px-4 sm:px-8">
          <Card className="shadow-lifted">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-3">
                <h1 className="font-serif text-2xl text-ink">{listing.propertyAddress}</h1>
                <Badge variant="forest" className="shrink-0 capitalize">
                  {listing.propertyType}
                </Badge>
              </div>

              <dl className="mt-5 flex flex-col gap-3 border-y border-forest-100 py-5 text-sm">
                <Row label="Rent per period" value={<UsdcAmount amount={listing.amountPerPeriod} />} />
                <Row label="Frequency" value={frequencyLabel} />
                <Row label="Total periods" value={String(listing.totalPeriods)} />
                <Row label="Rent escrowed on move-in" value={<UsdcAmount amount={total} />} />
                {listing.securityDeposit !== null && (
                  <>
                    <Row
                      label={cautionLabel.term}
                      value={
                        <span className="inline-flex items-center gap-1">
                          <UsdcAmount amount={listing.securityDeposit} /> (refundable)
                        </span>
                      }
                    />
                    <Row
                      label="Total deposit today"
                      value={<UsdcAmount amount={total + listing.securityDeposit} />}
                    />
                    {cautionReturnRate !== undefined && cautionReturnRate !== null && (
                      <Row
                        label={`Landlord's ${cautionLabel.term.toLowerCase()} return rate`}
                        value={`${(cautionReturnRate.rate * 100).toFixed(0)}% (${cautionReturnRate.returned}/${cautionReturnRate.total})`}
                      />
                    )}
                  </>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-ink-soft">Landlord</dt>
                  <dd>
                    <Link
                      href={`/u/${encodeURIComponent(listing.landlordEmail)}?address=${listing.landlordAddress}`}
                      className="font-medium text-forest-500 underline"
                    >
                      {listing.landlordEmail}
                    </Link>
                  </dd>
                </div>
              </dl>

              {isOwnListing ? (
                <div className="mt-6 flex flex-col gap-3">
                  <p className="text-sm text-ink-muted">This is your listing.</p>
                  <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
                    {deactivating ? "Removing…" : "Remove listing"}
                  </Button>
                </div>
              ) : (
                <div className="mt-6 flex flex-col gap-3">
                  <Button size="lg" className="w-full" onClick={handleRent}>
                    Deposit &amp; rent this property
                  </Button>
                  <Link href={`/messages/listing/${listing.id}`}>
                    <Button variant="secondary" size="lg" className="w-full">
                      Message landlord
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {listing.amenities.length > 0 && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <p className="text-sm font-semibold text-ink">Amenities</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {listing.amenities.map((a) => (
                    <span key={a} className="rounded-full bg-forest-50 px-3 py-1 text-xs font-medium text-forest-500">
                      {a}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(listing.houseRules || listing.noticePeriodDays !== null) && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <p className="text-sm font-semibold text-ink">Rules</p>
                {listing.houseRules && <p className="mt-2 text-sm text-ink-muted">{listing.houseRules}</p>}
                {listing.noticePeriodDays !== null && (
                  <p className="mt-2 text-sm text-ink-muted">
                    Termination notice period: {listing.noticePeriodDays} days
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {listing.condition && <ConditionDeclarationView condition={listing.condition} />}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
