"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { PropertyImage } from "@/components/PropertyImage";
import { Badge, Button, Card, CardContent, Skeleton } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { formatDate } from "@/lib/format";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import {
  listLeasesForTenant,
  listLeasesForLandlord,
  leaseStatus,
  getReputationStats,
  getCautionReturnRate,
  getTenancyCredentials,
  type Lease,
  type ReputationStats,
  type CautionReturnRate,
  type TenancyCredentialSummary,
} from "@/lib/leaseData";
import { useCautionFeeLabel } from "@/lib/cautionFee";
import { fetchListingsForLandlord, type Listing } from "@/lib/listings";
import { fetchProfile, type UserProfile } from "@/lib/profile";
import { fetchReviewsFor, type Review } from "@/lib/reviews";
import { TenancyCredentialCard } from "@/components/TenancyCredentialCard";

export default function ProfilePage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [reputation, setReputation] = useState<ReputationStats | null>(null);
  const [cautionReturnRate, setCautionReturnRate] = useState<CautionReturnRate | null | undefined>(undefined);
  const [tenantLeases, setTenantLeases] = useState<Lease[] | null>(null);
  const [landlordLeases, setLandlordLeases] = useState<Lease[] | null>(null);
  const [myListings, setMyListings] = useState<Listing[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [credentials, setCredentials] = useState<TenancyCredentialSummary[] | null>(null);
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchProfile(session.email).then(setProfile);
    getReputationStats(session).then(setReputation);
    getCautionReturnRate(session).then(setCautionReturnRate);
    listLeasesForTenant(session).then(setTenantLeases);
    listLeasesForLandlord(session).then(setLandlordLeases);
    fetchListingsForLandlord(session.email).then(setMyListings);
    fetchReviewsFor(session.email).then(setReviews);
    getTenancyCredentials(session.address).then(setCredentials);
  }, [session]);

  if (isLoading || !session) return null;

  const completedTenantLeases = (tenantLeases ?? []).filter((l) => leaseStatus(l) === "completed");
  const completedLandlordLeases = (landlordLeases ?? []).filter((l) => leaseStatus(l) === "completed");
  const score = reputation
    ? (reputation.completedAsTenant + reputation.completedAsLandlord) * 10 +
      reputation.disputesWonAsTenant * 3 -
      reputation.disputesLostAsTenant * 5
    : null;
  const avgRating =
    reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Profile</h1>

        {/* Public profile */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest-50 text-lg font-semibold text-forest-500">
                  {profile?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    session.email.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-serif text-xl text-ink">{profile?.name || session.email}</p>
                  <p className="text-sm text-ink-soft">
                    Member since {profile ? formatDate(new Date(profile.memberSince)) : "…"}
                  </p>
                </div>
              </div>
              <Link href="/settings/account">
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Reputation */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Rental reputation</p>
            {reputation === null ? (
              <Skeleton className="mt-2 h-9 w-32" />
            ) : (
              <>
                <p className="mt-1 text-3xl font-semibold text-ink">{score}</p>
                <p className="text-xs text-ink-soft">
                  Computed live from on-chain history — never stored, always re-derived.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-forest-100 pt-4 text-sm sm:grid-cols-4">
                  <Stat label="Completed (tenant)" value={reputation.completedAsTenant} />
                  <Stat label="Completed (landlord)" value={reputation.completedAsLandlord} />
                  <Stat label="Disputes won" value={reputation.disputesWonAsTenant} />
                  <Stat label="Disputes lost" value={reputation.disputesLostAsTenant} />
                </div>
                {cautionReturnRate !== undefined && cautionReturnRate !== null && (
                  <div className="mt-4 border-t border-forest-100 pt-4 text-sm">
                    <p className="text-xs text-ink-soft">{cautionLabel.term} return rate</p>
                    <p className="mt-0.5 font-semibold text-ink">
                      {(cautionReturnRate.rate * 100).toFixed(0)}% ({cautionReturnRate.returned}/{cautionReturnRate.total})
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Tenancy credentials */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-ink">Tenancy credentials</p>
            <p className="mt-1 text-xs text-ink-soft">
              Soulbound, minted only on a full, clean lease completion — never earned from a cancelled or
              early-terminated lease.
            </p>
            {credentials === null ? (
              <Skeleton className="mt-3 h-32 w-full" />
            ) : credentials.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                Complete your first lease to earn your tenancy credential.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {credentials.map((c) => (
                  <TenancyCredentialCard key={c.tokenId.toString()} credential={c} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rental history */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-ink">Rental history</p>
            {tenantLeases === null || landlordLeases === null ? (
              <Skeleton className="mt-3 h-16 w-full" />
            ) : completedTenantLeases.length === 0 && completedLandlordLeases.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No completed leases yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {completedTenantLeases.map((l) => (
                  <HistoryRow key={l.id} lease={l} role="Tenant" />
                ))}
                {completedLandlordLeases.map((l) => (
                  <HistoryRow key={l.id} lease={l} role="Landlord" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reviews */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Reviews</p>
              {avgRating !== null && (
                <span className="text-sm font-medium text-gold-600">
                  {avgRating.toFixed(1)} ★ ({reviews!.length})
                </span>
              )}
            </div>
            {reviews === null ? (
              <Skeleton className="mt-3 h-16 w-full" />
            ) : reviews.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                No reviews yet — they unlock for counterparties once a lease completes.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-md border border-forest-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{r.fromEmail}</span>
                      <span className="text-sm text-gold-600">{"★".repeat(r.rating)}</span>
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-ink-muted">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My properties */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-ink">My properties</p>
            {myListings === null ? (
              <Skeleton className="mt-3 h-16 w-full" />
            ) : myListings.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                You haven&apos;t listed anything yet.{" "}
                <Link href="/listings/new" className="text-forest-500 underline">
                  List a property
                </Link>
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {myListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                    className="flex items-center gap-3 rounded-md border border-forest-100 p-3 transition-colors hover:border-forest-200"
                  >
                    <PropertyImage
                      seed={listing.id}
                      propertyType={listing.propertyType}
                      overrideUrl={listing.photoUrl}
                      alt={listing.propertyAddress}
                      className="h-12 w-12 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{listing.propertyAddress}</p>
                      <p className="flex items-center gap-1 text-xs text-ink-soft">
                        <UsdcAmount amount={listing.amountPerPeriod} iconSize={11} /> / period
                      </p>
                    </div>
                    <Badge variant={listing.active ? "forest" : "neutral"}>{listing.active ? "Live" : "Rented"}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <div>
              <p className="text-sm font-semibold text-ink">Wallet</p>
              <p className="mt-1 text-sm text-ink-muted">Address, balance, and transfer out.</p>
            </div>
            <Link href="/wallet">
              <Button variant="secondary" size="sm">
                Open wallet
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}

function HistoryRow({ lease, role }: { lease: Lease; role: "Tenant" | "Landlord" }) {
  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === lease.frequency)?.label ?? lease.frequency;
  return (
    <div className="flex items-center justify-between rounded-md border border-forest-100 p-3 text-sm">
      <div>
        <p className="font-medium capitalize text-ink">{lease.propertyType}</p>
        <p className="text-xs text-ink-soft">
          {frequencyLabel} · {lease.totalPeriods} periods · as {role}
        </p>
      </div>
      <Badge variant="gold">Completed</Badge>
    </div>
  );
}
