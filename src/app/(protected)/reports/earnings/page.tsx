"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { CumulativeGrowthChart } from "@/components/earnings/CumulativeGrowthChart";
import { PropertyDonut } from "@/components/earnings/PropertyDonut";
import { formatDate, formatDateTime } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import { bucketSeries, monthLabel } from "@/lib/earningsBuckets";
import { getActivityFeed, listLeasesForLandlord, type ActivityItem, type Lease } from "@/lib/leaseData";

const usd = (n: number) => `${n.toFixed(2)} USDC`;
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

export default function EarningsReportPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [releases, setReleases] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    listLeasesForLandlord(session, false).then(setLeases);
    getActivityFeed(session, 1000).then((items) => setReleases(items.filter((i) => i.type === "release")));
  }, [session]);

  const leaseMap = useMemo(() => {
    const map = new Map<string, Lease>();
    for (const l of leases ?? []) map.set(l.id, l);
    return map;
  }, [leases]);

  const landlordReleases = useMemo(() => {
    const ids = new Set((leases ?? []).map((l) => l.id));
    return (releases ?? []).filter((r) => ids.has(r.leaseId)).sort((a, b) => a.timestamp - b.timestamp);
  }, [releases, leases]);

  const monthlySeries = useMemo(() => bucketSeries(landlordReleases, "monthly"), [landlordReleases]);

  const donutItems = useMemo(
    () =>
      (leases ?? [])
        .map((l) => ({ id: l.id, label: l.propertyAddress, value: l.amountPerPeriod * l.periodsReleased }))
        .filter((d) => d.value > 0),
    [leases],
  );

  const totalCumulative = (leases ?? []).reduce((sum, l) => sum + l.amountPerPeriod * l.periodsReleased, 0);
  const bestMonth = monthlySeries.reduce<[string, number] | null>(
    (best, cur) => (best === null || cur[1] > best[1] ? cur : best),
    null,
  );
  const firstRelease = landlordReleases[0]?.timestamp;
  const lastRelease = landlordReleases[landlordReleases.length - 1]?.timestamp;

  if (isLoading || !session) return null;

  const loading = leases === null || releases === null;

  return (
    <div className="min-h-screen bg-cream-100 print:bg-white">
      <style>{`@media print { @page { margin: 14mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      {/* action bar — screen only */}
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-6 print:hidden">
        <Link href="/wallet/earnings" className="text-sm text-forest-500 underline">
          ← Back to earnings
        </Link>
        <Button size="sm" onClick={() => window.print()} disabled={loading}>
          Download as PDF
        </Button>
      </div>

      {/* ── the document ── */}
      <div className="mx-auto my-6 max-w-4xl bg-white px-8 py-10 shadow-card print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none sm:px-12">
        {/* header */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest-500 pb-5">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div>
              <p className="font-serif text-xl font-semibold text-forest-500">RentPact</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-600">Earnings statement</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink">{session.email}</p>
            <p className="mt-1 text-[11px] text-ink-soft">Generated {formatDateTime(new Date(), "long")}</p>
            {firstRelease && lastRelease && (
              <p className="text-[11px] text-ink-soft">
                {formatDate(new Date(firstRelease), "long")} – {formatDate(new Date(lastRelease), "long")}
              </p>
            )}
          </div>
        </header>

        {loading ? (
          <p className="py-16 text-center text-sm text-ink-soft">Preparing your report…</p>
        ) : (
          <>
            {/* summary tiles */}
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label="Total received" value={usd(totalCumulative)} />
              <SummaryTile label="Properties" value={String(donutItems.length)} />
              <SummaryTile label="Releases" value={String(landlordReleases.length)} />
              <SummaryTile label="Best month" value={bestMonth ? usd(bestMonth[1]) : "—"} />
            </section>

            {/* growth curve — the card carries its own title */}
            {monthlySeries.length >= 2 && (
              <section className="mt-8">
                <CumulativeGrowthChart series={monthlySeries} labelFor={monthLabel} />
              </section>
            )}

            {/* donut — the card carries its own title */}
            {donutItems.length > 0 && (
              <section className="mt-6">
                <PropertyDonut items={donutItems} />
              </section>
            )}

            {/* per-property table */}
            <section className="mt-8">
              <SectionHeading>Per-property breakdown</SectionHeading>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-forest-100 text-left text-xs uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-3 font-medium">Property</th>
                    <th className="py-2 pr-3 font-medium">Periods</th>
                    <th className="py-2 text-right font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {(leases ?? []).map((l) => (
                    <tr key={l.id} className="border-b border-forest-100/60">
                      <td className="py-2 pr-3 text-ink">{l.propertyAddress}</td>
                      <td className="py-2 pr-3 text-ink-muted">
                        {l.periodsReleased} / {l.totalPeriods}
                      </td>
                      <td className="py-2 text-right font-medium text-ink">
                        {usd(l.amountPerPeriod * l.periodsReleased)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-forest-500">
                    <td className="py-2 pr-3 font-semibold text-ink" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2 text-right font-semibold text-forest-500">{usd(totalCumulative)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* per-release ledger */}
            {!MOCK_MODE && landlordReleases.length > 0 && (
              <section className="mt-8">
                <SectionHeading>Release ledger</SectionHeading>
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-forest-100 text-left text-xs uppercase tracking-wide text-ink-soft">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Property</th>
                      <th className="py-2 pr-3 text-right font-medium">Amount</th>
                      <th className="py-2 font-medium">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {landlordReleases.map((r) => (
                      <tr key={r.id} className="border-b border-forest-100/60">
                        <td className="py-2 pr-3 text-ink-muted">{formatDate(new Date(r.timestamp), "long")}</td>
                        <td className="py-2 pr-3 text-ink">{leaseMap.get(r.leaseId)?.propertyAddress ?? r.leaseId}</td>
                        <td className="py-2 pr-3 text-right font-medium text-ink">{usd(r.amount ?? 0)}</td>
                        <td className="py-2 font-mono text-[11px] text-ink-soft">{r.txHash ? shortHash(r.txHash) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <footer className="mt-10 border-t border-forest-100 pt-4 text-[11px] text-ink-soft">
              All amounts in USDC, settled on the Arc network. Figures reflect rent released from escrow to the
              landlord and are verifiable on-chain via each transaction hash.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-forest-100 bg-cream-100 px-3 py-3 print:bg-white">
      <p className="text-[10px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-500">{children}</h2>;
}
