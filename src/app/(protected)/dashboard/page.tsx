"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { LeaseCard } from "@/components/LeaseCard";
import { PropertyImage } from "@/components/PropertyImage";
import { EmptyState } from "@/components/EmptyState";
import { Badge, Button, Card, CardContent, CountUp, SkeletonText, Skeleton } from "@/components/ui";
import { CurrencyEquivalent } from "@/components/CurrencyEquivalent";
import { UsdcAmount } from "@/components/UsdcAmount";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { formatUSDC, formatDate, formatDateTime } from "@/lib/format";
import { INTERVAL_DAYS } from "@/lib/contracts/frequency";
import { CAUTION_CLAIM_WINDOW_MS, DAY_MS } from "@/lib/constitution";
import {
  listLeasesForTenant,
  listLeasesForLandlord,
  leaseStatus,
  nextReleaseDate,
  pendingPeriods,
  signDeadline,
  type Lease,
} from "@/lib/leaseData";
import { fetchListingsForLandlord, type Listing } from "@/lib/listings";

export default function DashboardPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [tenantLeases, setTenantLeases] = useState<Lease[] | null>(null);
  const [landlordLeases, setLandlordLeases] = useState<Lease[] | null>(null);
  const [myListings, setMyListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    listLeasesForTenant(session).then(setTenantLeases);
    listLeasesForLandlord(session).then(setLandlordLeases);
    fetchListingsForLandlord(session.email).then(setMyListings);
  }, [session]);

  const stats = useMemo(() => {
    if (!tenantLeases || !landlordLeases) return null;

    const isLive = (l: Lease) => {
      const s = leaseStatus(l);
      return s === "active" || s === "disputed" || s === "awaiting-signature";
    };

    const totalInEscrow = tenantLeases
      .filter(isLive)
      .reduce((sum, l) => sum + l.amountPerPeriod * (l.totalPeriods - l.periodsReleased), 0);

    const cumulativeReceived = landlordLeases.reduce((sum, l) => sum + l.amountPerPeriod * l.periodsReleased, 0);

    const estMonthlyIncome = landlordLeases
      .filter((l) => leaseStatus(l) === "active")
      .reduce((sum, l) => sum + (l.amountPerPeriod / INTERVAL_DAYS[l.frequency]) * 30, 0);

    type Upcoming = { lease: Lease; role: "tenant" | "landlord"; date: Date };
    const upcoming: Upcoming[] = [];
    for (const l of tenantLeases) {
      const d = nextReleaseDate(l);
      if (d) upcoming.push({ lease: l, role: "tenant", date: d });
    }
    for (const l of landlordLeases) {
      const d = nextReleaseDate(l);
      if (d) upcoming.push({ lease: l, role: "landlord", date: d });
    }
    upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    const nextRelease = upcoming[0] ?? null;

    interface Alert {
      id: string;
      message: string;
      href: string;
      tone: "warn" | "action";
    }
    const alerts: Alert[] = [];

    for (const l of landlordLeases) {
      if (leaseStatus(l) !== "awaiting-signature") continue;
      const daysLeft = Math.max(0, Math.ceil((signDeadline(l).getTime() - Date.now()) / 86_400_000));
      alerts.push({
        id: `${l.id}-sign`,
        message: `Sign to activate ${l.propertyAddress} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
        href: `/leases/${l.id}/invite`,
        tone: "action",
      });
    }
    for (const l of tenantLeases) {
      if (leaseStatus(l) !== "awaiting-signature") continue;
      const daysLeft = Math.max(0, Math.ceil((signDeadline(l).getTime() - Date.now()) / 86_400_000));
      alerts.push({
        id: `${l.id}-waiting`,
        message: `Waiting for ${l.landlordEmail} to sign ${l.propertyAddress} — reclaimable in ${daysLeft} day${daysLeft === 1 ? "" : "s"} if unsigned`,
        href: `/leases/${l.id}`,
        tone: "warn",
      });
    }
    for (const l of [...tenantLeases, ...landlordLeases]) {
      if (leaseStatus(l) !== "active") continue;
      const due = pendingPeriods(l);
      if (due > 0) {
        alerts.push({
          id: `${l.id}-release`,
          message: `${due} period${due === 1 ? "" : "s"} ready to release on ${l.propertyAddress}`,
          href: `/leases/${l.id}`,
          tone: "action",
        });
      }
    }
    for (const l of [...tenantLeases, ...landlordLeases]) {
      if (!l.disputeActive) continue;
      alerts.push({
        id: `${l.id}-dispute`,
        message: `Dispute active on ${l.propertyAddress} — awaiting arbiter resolution`,
        href: `/leases/${l.id}/dispute`,
        tone: "warn",
      });
    }
    // Article 6.5 — caution fee claim window, live condition (not a discrete event, so it
    // lives here rather than in the notification feed, same principle as sign deadlines).
    for (const l of tenantLeases) {
      if (l.cautionAmount <= 0 || l.completedAt === null || l.cautionSettled || l.cautionClaimFiledAt !== null) continue;
      const daysLeft = Math.max(0, Math.ceil((l.completedAt + CAUTION_CLAIM_WINDOW_MS - Date.now()) / DAY_MS));
      alerts.push({
        id: `${l.id}-caution-countdown`,
        message: `Caution fee returns in ${daysLeft} day${daysLeft === 1 ? "" : "s"} on ${l.propertyAddress} · ${formatUSDC(l.cautionAmount)} USDC`,
        href: `/leases/${l.id}`,
        tone: "action",
      });
    }
    for (const l of landlordLeases) {
      if (l.cautionAmount <= 0 || l.completedAt === null || l.cautionSettled || l.cautionClaimFiledAt !== null) continue;
      const deadline = l.completedAt + CAUTION_CLAIM_WINDOW_MS;
      const hoursLeft = (deadline - Date.now()) / (60 * 60 * 1000);
      if (hoursLeft > 48 || hoursLeft <= 0) continue;
      alerts.push({
        id: `${l.id}-claim-window-closing`,
        message: `Caution fee claim window closes in ${Math.ceil(hoursLeft)} hours on ${l.propertyAddress}`,
        href: `/leases/${l.id}`,
        tone: "warn",
      });
    }

    const rentedListings = (myListings ?? []).filter((l) => !l.active).length;
    const totalListings = myListings?.length ?? 0;

    return { totalInEscrow, cumulativeReceived, estMonthlyIncome, nextRelease, alerts, rentedListings, totalListings };
  }, [tenantLeases, landlordLeases, myListings]);

  const isLandlord = (landlordLeases?.length ?? 0) > 0 || (myListings?.length ?? 0) > 0;

  if (isLoading || !session) {
    return (
      <div className="min-h-screen bg-cream">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
          <Skeleton className="h-8 w-48" />
          <div className="mt-6">
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Your dashboard</h1>
        <p className="mt-1 text-ink-muted">{session.email}</p>

        {/* Command strip */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Total in escrow</p>
              {stats === null ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <>
                  <p className="mt-1 flex items-center gap-1 text-2xl font-semibold text-ink">
                    <UsdcIcon className="h-4 w-4 shrink-0" />
                    <CountUp value={stats.totalInEscrow} /> <span className="text-sm font-normal text-ink-soft">USDC</span>
                  </p>
                  <CurrencyEquivalent usdcAmount={stats.totalInEscrow} className="mt-1 block text-xs text-ink-soft" />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Next release</p>
              {stats === null ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : stats.nextRelease ? (
                <>
                  <p className="mt-1 flex items-center gap-1 text-2xl font-semibold text-ink">
                    <UsdcIcon className="h-4 w-4 shrink-0" />
                    {formatUSDC(stats.nextRelease.lease.amountPerPeriod)}{" "}
                    <span className="text-sm font-normal text-ink-soft">USDC</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {stats.nextRelease.role === "tenant" ? "You pay" : "You receive"} ·{" "}
                    {stats.nextRelease.lease.frequency === "daily" || stats.nextRelease.lease.frequency === "hourly"
                      ? formatDateTime(stats.nextRelease.date)
                      : formatDate(stats.nextRelease.date)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink-soft">No upcoming releases</p>
              )}
            </CardContent>
          </Card>

          {isLandlord && (
            <>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs uppercase tracking-wide text-ink-soft">Cumulative received</p>
                  {stats === null ? (
                    <Skeleton className="mt-2 h-8 w-24" />
                  ) : (
                    <p className="mt-1 flex items-center gap-1 text-2xl font-semibold text-ink">
                      <UsdcIcon className="h-4 w-4 shrink-0" />
                      <CountUp value={stats.cumulativeReceived} /> <span className="text-sm font-normal text-ink-soft">USDC</span>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs uppercase tracking-wide text-ink-soft">Occupancy</p>
                  {stats === null ? (
                    <Skeleton className="mt-2 h-8 w-24" />
                  ) : (
                    <>
                      <p className="mt-1 text-2xl font-semibold text-ink">
                        {stats.rentedListings} / {stats.totalListings}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
                        Est. <UsdcAmount amount={stats.estMonthlyIncome} iconSize={11} /> / month
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Action-required alerts */}
        {stats && stats.alerts.length > 0 && (
          <div className="mt-6 flex flex-col gap-2">
            {stats.alerts.map((alert) => (
              <Link
                key={alert.id}
                href={alert.href}
                className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
                  alert.tone === "warn"
                    ? "border-gold-200 bg-gold-50 text-gold-700 hover:border-gold-300"
                    : "border-forest-200 bg-forest-50 text-forest-600 hover:border-forest-300"
                }`}
              >
                <span>{alert.message}</span>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/listings">
            <Button variant="secondary">Browse listings</Button>
          </Link>
          <Link href="/listings/new">
            <Button variant="secondary">List a property</Button>
          </Link>
          <Link href="/profile">
            <Button variant="ghost">View profile</Button>
          </Link>
        </div>

        {/* Recent activity lives in Wallet → Transactions — rendering it here
            too meant a second full event-log scan on the app's most-visited
            page, so the dashboard just links to it instead. */}
        <section className="mt-10">
          <Link href="/wallet/transactions" className="text-sm font-medium text-forest-500 underline">
            View recent activity and transactions →
          </Link>
        </section>

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Renting</h2>
            {tenantLeases && tenantLeases.length > 0 && (
              <Link href="/leases" className="text-sm font-medium text-forest-500 underline">
                View all leases →
              </Link>
            )}
          </div>
          <div className="mt-4">
            {tenantLeases === null ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Skeleton className="h-56 w-full" />
                <Skeleton className="h-56 w-full" />
              </div>
            ) : tenantLeases.length === 0 ? (
              <EmptyState
                title="No leases yet"
                body="Browse available listings and deposit into escrow to start a lease."
                ctaLabel="Browse listings"
                ctaHref="/listings"
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {tenantLeases.slice(0, 4).map((lease) => (
                  <LeaseCard key={lease.id} lease={lease} viewerRole="tenant" />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Landlording</h2>
            {landlordLeases && landlordLeases.length > 0 && (
              <Link href="/leases" className="text-sm font-medium text-forest-500 underline">
                View all leases →
              </Link>
            )}
          </div>
          <div className="mt-4">
            {landlordLeases === null ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : landlordLeases.length === 0 ? (
              <EmptyState
                title="No incoming leases yet"
                body="Leases where you're the landlord show up here once a tenant deposits into one of your listings."
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {landlordLeases.slice(0, 4).map((lease) => (
                  <LeaseCard key={lease.id} lease={lease} viewerRole="landlord" />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-ink">Your listings</h2>
          <div className="mt-4">
            {myListings === null ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : myListings.length === 0 ? (
              <EmptyState
                title="No listings yet"
                body="Publish a property so tenants can find it and deposit into escrow."
                ctaLabel="List a property"
                ctaHref="/listings/new"
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {myListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                    className="flex items-center gap-4 overflow-hidden rounded-lg border border-forest-100/60 bg-cream-100 p-4 shadow-card transition-shadow hover:shadow-lifted"
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
                      <p className="flex items-center gap-1 text-sm text-ink-soft">
                        <UsdcAmount amount={listing.amountPerPeriod} /> / period
                      </p>
                    </div>
                    <Badge variant={listing.active ? "forest" : "neutral"}>
                      {listing.active ? "Live" : "Rented"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
  );
}
