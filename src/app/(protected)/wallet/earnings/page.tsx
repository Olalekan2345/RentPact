"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button, Skeleton } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { CumulativeGrowthChart } from "@/components/earnings/CumulativeGrowthChart";
import { PropertyDonut } from "@/components/earnings/PropertyDonut";
import { formatUSDC } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import { getActivityFeed, listLeasesForLandlord, type ActivityItem, type Lease } from "@/lib/leaseData";
import { bucketSeries, monthLabel, weekLabel, type Granularity } from "@/lib/earningsBuckets";
import { exportEarningsExcel } from "@/lib/earningsExcel";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EarningsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [releases, setReleases] = useState<ActivityItem[] | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [excelBusy, setExcelBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  // Remember each landlord's preferred view so it sticks between visits.
  const granularityKey = session ? `rentpact:earnings-granularity:v1:${session.email}` : null;
  useEffect(() => {
    if (!granularityKey) return;
    try {
      const saved = window.localStorage.getItem(granularityKey);
      if (saved === "weekly" || saved === "monthly") setGranularity(saved);
    } catch {
      /* ignore */
    }
  }, [granularityKey]);

  const chooseGranularity = (g: Granularity) => {
    setGranularity(g);
    if (granularityKey) {
      try {
        window.localStorage.setItem(granularityKey, g);
      } catch {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    if (!session) return;
    listLeasesForLandlord(session, false).then(setLeases);
    getActivityFeed(session, 1000).then((items) => setReleases(items.filter((i) => i.type === "release")));
  }, [session]);

  const landlordLeaseIds = useMemo(() => new Set((leases ?? []).map((l) => l.id)), [leases]);
  const landlordReleases = useMemo(
    () => (releases ?? []).filter((r) => landlordLeaseIds.has(r.leaseId)),
    [releases, landlordLeaseIds],
  );

  const series = useMemo(() => bucketSeries(landlordReleases, granularity), [landlordReleases, granularity]);

  const maxSeries = Math.max(1, ...series.map(([, amount]) => amount));
  const labelFor = granularity === "weekly" ? weekLabel : monthLabel;

  const leaseMap = useMemo(() => {
    const map = new Map<string, Lease>();
    for (const l of leases ?? []) map.set(l.id, l);
    return map;
  }, [leases]);

  const totalCumulative = (leases ?? []).reduce((sum, l) => sum + l.amountPerPeriod * l.periodsReleased, 0);

  const donutItems = useMemo(
    () =>
      (leases ?? [])
        .map((l) => ({ id: l.id, label: l.propertyAddress, value: l.amountPerPeriod * l.periodsReleased }))
        .filter((d) => d.value > 0),
    [leases],
  );

  const handleExportCsv = () => {
    if (!leases) return;
    if (!MOCK_MODE && landlordReleases.length > 0) {
      const rows: string[][] = [["Date", "Property", "Amount (USDC)", "Tx Hash"]];
      for (const r of landlordReleases) {
        const lease = leaseMap.get(r.leaseId);
        rows.push([
          new Date(r.timestamp).toISOString(),
          lease?.propertyAddress ?? r.leaseId,
          String(r.amount ?? 0),
          r.txHash ?? "",
        ]);
      }
      downloadCsv("rentpact-earnings.csv", rows);
      return;
    }

    const rows: string[][] = [["Property", "Periods Released", "Total Received (USDC)"]];
    for (const l of leases) {
      rows.push([l.propertyAddress, String(l.periodsReleased), String(l.amountPerPeriod * l.periodsReleased)]);
    }
    downloadCsv("rentpact-earnings.csv", rows);
  };

  const handleExportExcel = async () => {
    if (!leases || !session) return;
    setExcelBusy(true);
    try {
      await exportEarningsExcel({
        email: session.email,
        totalCumulative,
        monthlySeries: bucketSeries(landlordReleases, "monthly"),
        donutItems,
        leases: leases.map((l) => ({
          propertyAddress: l.propertyAddress,
          periodsReleased: l.periodsReleased,
          totalPeriods: l.totalPeriods,
          total: l.amountPerPeriod * l.periodsReleased,
        })),
        releases: MOCK_MODE
          ? []
          : landlordReleases.map((r) => ({
              timestamp: r.timestamp,
              property: leaseMap.get(r.leaseId)?.propertyAddress ?? r.leaseId,
              amount: r.amount ?? 0,
              txHash: r.txHash,
            })),
      });
    } finally {
      setExcelBusy(false);
    }
  };

  if (isLoading || !session) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-soft">Cumulative received</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            <UsdcAmount amount={totalCumulative} iconSize={18} />
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Link href="/reports/earnings">
            <Button variant="secondary" size="sm">
              PDF
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={handleExportExcel} disabled={leases === null || excelBusy}>
            {excelBusy ? "Preparing…" : "Excel"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={leases === null}>
            CSV
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Earnings over time</p>
          {!MOCK_MODE && (
            <div
              role="group"
              aria-label="Income period"
              className="inline-flex rounded-full border border-forest-100 bg-cream-100 p-0.5 text-xs font-medium"
            >
              {(["weekly", "monthly"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => chooseGranularity(g)}
                  aria-pressed={granularity === g}
                  className={`rounded-full px-3 py-1 capitalize transition-colors ${
                    granularity === g
                      ? "bg-forest-500 text-cream-50 shadow-sm"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
        {MOCK_MODE ? (
          <p className="mt-2 text-sm text-ink-soft">
            Testnet mock mode has no per-release timestamps, so an income-over-time breakdown isn&apos;t
            available — the per-property total below is still accurate.
          </p>
        ) : releases === null ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : series.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No releases yet.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {series.length >= 2 && <CumulativeGrowthChart series={series} labelFor={labelFor} />}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
                {granularity === "weekly" ? "Per week" : "Per month"}
              </p>
              <div className="flex items-end gap-3 overflow-x-auto pb-2">
                {series.map(([key, amount]) => (
                  <div key={key} className="flex shrink-0 flex-col items-center gap-1">
                    <span className="text-xs font-medium text-ink">{formatUSDC(amount)}</span>
                    <div
                      className="w-10 rounded-t-md bg-forest-400"
                      style={{ height: `${Math.max(8, (amount / maxSeries) * 120)}px` }}
                    />
                    <span className="text-[11px] text-ink-soft">{labelFor(key)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Per-property breakdown</p>
        {leases === null ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : leases.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No landlord leases yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {donutItems.length > 0 && <PropertyDonut items={donutItems} />}
            <div className="flex flex-col gap-2">
            {leases.map((l) => (
              <Link
                key={l.id}
                href={`/leases/${l.id}`}
                className="flex items-center justify-between rounded-md border border-forest-100 px-4 py-3 text-sm hover:border-forest-200"
              >
                <div>
                  <p className="font-medium text-ink">{l.propertyAddress}</p>
                  <p className="text-xs text-ink-soft">
                    {l.periodsReleased} / {l.totalPeriods} periods released
                  </p>
                </div>
                <span className="font-semibold text-ink">
                  <UsdcAmount amount={l.amountPerPeriod * l.periodsReleased} />
                </span>
              </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
