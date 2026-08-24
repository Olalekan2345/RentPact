"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button, Skeleton } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { formatUSDC } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import { getActivityFeed, listLeasesForLandlord, type ActivityItem, type Lease } from "@/lib/leaseData";

function monthKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

type Granularity = "weekly" | "monthly";

/** Monday 00:00 of the week a timestamp falls in — the bucket key for weekly grouping. */
function weekKey(timestamp: number): string {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0, …
  d.setDate(d.getDate() - mondayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

  const series = useMemo(() => {
    const keyFn = granularity === "weekly" ? weekKey : monthKey;
    const buckets = new Map<string, number>();
    for (const r of landlordReleases) {
      const key = keyFn(r.timestamp);
      buckets.set(key, (buckets.get(key) ?? 0) + (r.amount ?? 0));
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [landlordReleases, granularity]);

  const maxSeries = Math.max(1, ...series.map(([, amount]) => amount));
  const labelFor = granularity === "weekly" ? weekLabel : monthLabel;

  const leaseMap = useMemo(() => {
    const map = new Map<string, Lease>();
    for (const l of leases ?? []) map.set(l.id, l);
    return map;
  }, [leases]);

  const totalCumulative = (leases ?? []).reduce((sum, l) => sum + l.amountPerPeriod * l.periodsReleased, 0);

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
        <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={leases === null}>
          Export CSV
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">
            {granularity === "weekly" ? "Weekly income" : "Monthly income"}
          </p>
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
          <div className="mt-4 flex items-end gap-3 overflow-x-auto pb-2">
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
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Per-property breakdown</p>
        {leases === null ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : leases.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No landlord leases yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
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
        )}
      </div>
    </div>
  );
}
