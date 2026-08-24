"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Skeleton } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { CumulativeGrowthChart } from "@/components/earnings/CumulativeGrowthChart";
import { PropertyDonut } from "@/components/earnings/PropertyDonut";
import { formatUSDC } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import { bucketSeries, monthLabel, weekLabel, type Granularity } from "@/lib/earningsBuckets";
import { exportStatementExcel } from "@/lib/earningsExcel";
import { buildStatement, STATEMENT_LABELS, type StatementVariant } from "@/lib/statement";
import type { ActivityItem, Lease } from "@/lib/leaseData";

/**
 * The shared on-screen tab for landlord Earnings and tenant Spending. Same
 * charts, tables and exports; only the wording changes by variant. See
 * lib/statement for the model.
 */
export function StatementTab({
  variant,
  email,
  leases,
  releases,
}: {
  variant: StatementVariant;
  email: string;
  leases: Lease[] | null;
  releases: ActivityItem[] | null;
}) {
  const labels = STATEMENT_LABELS[variant];
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [excelBusy, setExcelBusy] = useState(false);

  const granularityKey = `${labels.granularityKeyBase}:${email}`;
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(granularityKey);
      if (saved === "weekly" || saved === "monthly") setGranularity(saved);
    } catch {
      /* ignore */
    }
  }, [granularityKey]);

  const chooseGranularity = (g: Granularity) => {
    setGranularity(g);
    try {
      window.localStorage.setItem(granularityKey, g);
    } catch {
      /* ignore */
    }
  };

  const data = useMemo(() => buildStatement(leases ?? [], releases ?? []), [leases, releases]);
  const series = useMemo(() => bucketSeries(data.releases, granularity), [data.releases, granularity]);
  const maxSeries = Math.max(1, ...series.map(([, amount]) => amount));
  const labelFor = granularity === "weekly" ? weekLabel : monthLabel;

  const handleExportExcel = async () => {
    if (!leases) return;
    setExcelBusy(true);
    try {
      await exportStatementExcel({
        variant,
        email,
        totalCumulative: data.totalCumulative,
        monthlySeries: data.monthlySeries,
        donutItems: data.donutItems,
        leases: data.propertyRows,
        releases: MOCK_MODE ? [] : data.ledgerRows,
      });
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-soft">{labels.overviewLabel}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            <UsdcAmount amount={data.totalCumulative} iconSize={18} />
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportExcel} disabled={leases === null || excelBusy}>
            {excelBusy ? "Preparing…" : "Excel"}
          </Button>
          <Link href={labels.reportPath}>
            <Button variant="secondary" size="sm">
              PDF report
            </Button>
          </Link>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{labels.overTimeTitle}</p>
          {!MOCK_MODE && (
            <div
              role="group"
              aria-label="Period"
              className="inline-flex rounded-full border border-forest-100 bg-cream-100 p-0.5 text-xs font-medium"
            >
              {(["weekly", "monthly"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => chooseGranularity(g)}
                  aria-pressed={granularity === g}
                  className={`rounded-full px-3 py-1 capitalize transition-colors ${
                    granularity === g ? "bg-forest-500 text-cream-50 shadow-sm" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
        {MOCK_MODE ? (
          <p className="mt-2 text-sm text-ink-soft">{labels.mockNote}</p>
        ) : releases === null ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : series.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{labels.emptyReleases}</p>
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
        ) : data.propertyRows.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{labels.breakdownEmpty}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {data.donutItems.length > 0 && <PropertyDonut items={data.donutItems} />}
            <div className="flex flex-col gap-2">
              {data.propertyRows.map((p) => (
                <Link
                  key={p.id}
                  href={`/leases/${p.id}`}
                  className="flex items-center justify-between rounded-md border border-forest-100 px-4 py-3 text-sm hover:border-forest-200"
                >
                  <div>
                    <p className="font-medium text-ink">{p.propertyAddress}</p>
                    <p className="text-xs text-ink-soft">
                      {p.periodsReleased} / {p.totalPeriods} periods {labels.periodsWord}
                    </p>
                  </div>
                  <span className="font-semibold text-ink">
                    <UsdcAmount amount={p.total} />
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
