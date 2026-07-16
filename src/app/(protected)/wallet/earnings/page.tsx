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

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    listLeasesForLandlord(session).then(setLeases);
    getActivityFeed(session, 1000).then((items) => setReleases(items.filter((i) => i.type === "release")));
  }, [session]);

  const landlordLeaseIds = useMemo(() => new Set((leases ?? []).map((l) => l.id)), [leases]);
  const landlordReleases = useMemo(
    () => (releases ?? []).filter((r) => landlordLeaseIds.has(r.leaseId)),
    [releases, landlordLeaseIds],
  );

  const monthly = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const r of landlordReleases) {
      const key = monthKey(r.timestamp);
      byMonth.set(key, (byMonth.get(key) ?? 0) + (r.amount ?? 0));
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [landlordReleases]);

  const maxMonthly = Math.max(1, ...monthly.map(([, amount]) => amount));

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
        <p className="text-sm font-semibold text-ink">Monthly income</p>
        {MOCK_MODE ? (
          <p className="mt-2 text-sm text-ink-soft">
            Testnet mock mode has no per-release timestamps, so a monthly breakdown isn&apos;t available — the
            per-property total below is still accurate.
          </p>
        ) : releases === null ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : monthly.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No releases yet.</p>
        ) : (
          <div className="mt-4 flex items-end gap-3 overflow-x-auto pb-2">
            {monthly.map(([key, amount]) => (
              <div key={key} className="flex shrink-0 flex-col items-center gap-1">
                <span className="text-xs font-medium text-ink">{formatUSDC(amount)}</span>
                <div
                  className="w-10 rounded-t-md bg-forest-400"
                  style={{ height: `${Math.max(8, (amount / maxMonthly) * 120)}px` }}
                />
                <span className="text-[11px] text-ink-soft">{monthLabel(key)}</span>
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
