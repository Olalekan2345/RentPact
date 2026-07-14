"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, CardContent, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { MOCK_MODE } from "@/lib/circle";
import type { Address } from "viem";
import {
  getReputationStats,
  getCautionReturnRate,
  getTenancyCredentials,
  listLeasesForTenant,
  listLeasesForLandlord,
  leaseStatus,
  type Lease,
  type ReputationStats,
  type CautionReturnRate,
  type TenancyCredentialSummary,
} from "@/lib/leaseData";
import { useCautionFeeLabel } from "@/lib/cautionFee";
import { fetchProfile, type UserProfile } from "@/lib/profile";
import { fetchReviewsFor, type Review } from "@/lib/reviews";
import { fetchPrivacyPrefs, type PrivacyPrefs } from "@/lib/privacy";
import { TenancyCredentialCard } from "@/components/TenancyCredentialCard";

export default function PublicProfilePage() {
  const { email: rawEmail } = useParams<{ email: string }>();
  const searchParams = useSearchParams();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const email = decodeURIComponent(rawEmail).toLowerCase();
  const address = searchParams.get("address") as Address | null;

  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<PrivacyPrefs | null>(null);
  const [reputation, setReputation] = useState<ReputationStats | null>(null);
  const [cautionReturnRate, setCautionReturnRate] = useState<CautionReturnRate | null | undefined>(undefined);
  const [tenantLeases, setTenantLeases] = useState<Lease[] | null>(null);
  const [landlordLeases, setLandlordLeases] = useState<Lease[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [credentials, setCredentials] = useState<TenancyCredentialSummary[] | null>(null);
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    fetchProfile(email).then(setProfile);
    fetchPrivacyPrefs(email).then(setPrefs);
    fetchReviewsFor(email).then(setReviews);

    const canScanChain = MOCK_MODE || !!address;
    if (canScanChain) {
      const target = { email, address: address ?? ("0x0000000000000000000000000000000000000000" as Address) };
      getReputationStats(target).then(setReputation);
      getCautionReturnRate(target).then(setCautionReturnRate);
      getTenancyCredentials(target.address).then(setCredentials);
      listLeasesForTenant(target).then(setTenantLeases);
      listLeasesForLandlord(target).then(setLandlordLeases);
    }
  }, [email, address]);

  if (isLoading || !session || profile === undefined) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const canScanChain = MOCK_MODE || !!address;
  const completedTenant = (tenantLeases ?? []).filter((l) => leaseStatus(l) === "completed");
  const completedLandlord = (landlordLeases ?? []).filter((l) => leaseStatus(l) === "completed");
  const score = reputation
    ? (reputation.completedAsTenant + reputation.completedAsLandlord) * 10 +
      reputation.disputesWonAsTenant * 3 -
      reputation.disputesLostAsTenant * 5
    : null;
  const avgRating = reviews && reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest-50 text-lg font-semibold text-forest-500">
            {profile?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              email.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="font-serif text-2xl text-ink">{profile?.name || email}</h1>
            <p className="text-sm text-ink-soft">
              Member since {profile ? formatDate(new Date(profile.memberSince)) : "…"}
            </p>
          </div>
        </div>

        {prefs?.showReputation !== false && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Rental reputation</p>
              {!canScanChain ? (
                <p className="mt-2 text-sm text-ink-soft">Not available from this view.</p>
              ) : reputation === null ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : (
                <>
                  <p className="mt-1 text-3xl font-semibold text-ink">{score}</p>
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
        )}

        {prefs?.showReputation !== false && canScanChain && credentials !== null && credentials.length > 0 && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-ink">Tenancy credentials</p>
              <p className="mt-1 text-xs text-ink-soft">
                Soulbound, minted only on a full, clean lease completion — the reputation payoff before you sign.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {credentials.map((c) => (
                  <TenancyCredentialCard key={c.tokenId.toString()} credential={c} compact />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {prefs?.showRentalHistory !== false && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-ink">Rental history</p>
              {!canScanChain ? (
                <p className="mt-2 text-sm text-ink-soft">Not available from this view.</p>
              ) : tenantLeases === null || landlordLeases === null ? (
                <Skeleton className="mt-3 h-16 w-full" />
              ) : completedTenant.length === 0 && completedLandlord.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">No completed leases yet.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {completedTenant.map((l) => (
                    <HistoryRow key={l.id} lease={l} role="Tenant" />
                  ))}
                  {completedLandlord.map((l) => (
                    <HistoryRow key={l.id} lease={l} role="Landlord" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {prefs?.showReviews !== false && (
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
                <p className="mt-2 text-sm text-ink-soft">No reviews yet.</p>
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
        )}
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
