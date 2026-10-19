"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import type { Address } from "viem";
import {
  getReputationStats,
  getCautionReturnRate,
  getTenancyCredentials,
  listLeasesForTenant,
  listLeasesForLandlord,
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
import { ReviewsSection } from "@/components/reviews";
import { RentalHistory } from "@/components/RentalHistory";
import { fetchLandlordBadge } from "@/lib/verification";
import { VerifiedLandlordBadge } from "@/components/verification/VerificationBadge";

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
  const [verifiedLandlord, setVerifiedLandlord] = useState(false);
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    fetchProfile(email).then(setProfile);
    fetchPrivacyPrefs(email).then(setPrefs);
    fetchReviewsFor(email).then(setReviews);
    fetchLandlordBadge(email).then((b) => setVerifiedLandlord(b.verified));

    const canScanChain = MOCK_MODE || !!address;
    if (canScanChain) {
      const target = { email, address: address ?? ("0x0000000000000000000000000000000000000000" as Address) };
      getReputationStats(target).then(setReputation);
      getCautionReturnRate(target).then(setCautionReturnRate);
      getTenancyCredentials(target.address).then(setCredentials);
      listLeasesForTenant(target, false).then(setTenantLeases);
      listLeasesForLandlord(target, false).then(setLandlordLeases);
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
  const score = reputation
    ? (reputation.completedAsTenant + reputation.completedAsLandlord) * 10 +
      reputation.disputesWonAsTenant * 3 -
      reputation.disputesLostAsTenant * 5
    : null;

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
            {verifiedLandlord && <VerifiedLandlordBadge className="mt-1" />}
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
          <RentalHistory tenantLeases={tenantLeases} landlordLeases={landlordLeases} unavailable={!canScanChain} />
        )}

        {prefs?.showReviews !== false && (
          <ReviewsSection
            reviews={reviews}
            emptyText="No reviews yet. Reviews come only from the other party of a real RentPact lease."
          />
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
