"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatUSDC } from "@/lib/format";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { INTERVAL_DAYS } from "@/lib/contracts/frequency";
import { leaseStatus, type Lease } from "@/lib/leaseData";

interface ScheduledRelease {
  lease: Lease;
  date: Date;
  periodIndex: number;
}

function scheduledReleasesInMonth(leases: Lease[], monthStart: Date, monthEnd: Date): ScheduledRelease[] {
  const out: ScheduledRelease[] = [];
  for (const lease of leases) {
    if (!lease.signedAt) continue;
    const status = leaseStatus(lease);
    if (status === "cancelled") continue;

    const intervalMs = INTERVAL_DAYS[lease.frequency] * 86_400_000;
    for (let period = lease.periodsReleased + 1; period <= lease.totalPeriods; period++) {
      const date = new Date(lease.signedAt + period * intervalMs);
      if (date >= monthStart && date < monthEnd) {
        out.push({ lease, date, periodIndex: period });
      }
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function UpcomingPaymentsCalendar({ leases }: { leases: Lease[] }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const { monthLabel, weeks, releasesByDay } = useMemo(() => {
    const now = new Date();
    const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);

    const releases = scheduledReleasesInMonth(leases, monthStart, monthEnd);
    const byDay = new Map<number, ScheduledRelease[]>();
    for (const r of releases) {
      const day = r.date.getDate();
      byDay.set(day, [...(byDay.get(day) ?? []), r]);
    }

    const daysInMonth = monthEnd.getTime() === monthStart.getTime() ? 0 : new Date(monthEnd.getTime() - 86_400_000).getDate();
    const firstWeekday = monthStart.getDay();
    const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return {
      monthLabel: monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      weeks,
      releasesByDay: byDay,
    };
  }, [leases, monthOffset]);

  const today = new Date();
  const isCurrentMonth = monthOffset === 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonthOffset((v) => v - 1)}
          className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-cream-300"
          aria-label="Previous month"
        >
          ←
        </button>
        <p className="text-sm font-medium text-ink">{monthLabel}</p>
        <button
          onClick={() => setMonthOffset((v) => v + 1)}
          className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-cream-300"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-ink-soft">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="mt-1 flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              const releases = day ? releasesByDay.get(day) : undefined;
              const isToday = isCurrentMonth && day === today.getDate();
              return (
                <div
                  key={di}
                  className={`flex aspect-square flex-col items-center justify-center rounded-md text-xs ${
                    day === null ? "" : isToday ? "bg-forest-50 font-semibold text-forest-500" : "text-ink-muted"
                  }`}
                >
                  {day}
                  {releases && releases.length > 0 && <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-gold-400" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-forest-100 pt-3">
        {releasesByDay.size === 0 ? (
          <p className="text-sm text-ink-soft">No releases scheduled this month.</p>
        ) : (
          [...releasesByDay.entries()]
            .sort(([a], [b]) => a - b)
            .flatMap(([, releases]) => releases)
            .map((r) => (
              <Link
                key={`${r.lease.id}-${r.periodIndex}`}
                href={`/leases/${r.lease.id}`}
                className="flex items-center justify-between rounded-md border border-forest-100 px-3 py-2 text-sm hover:border-forest-200"
              >
                <span className="text-ink-muted">{r.lease.propertyAddress}</span>
                <span className="flex items-center gap-1 font-medium text-ink">
                  <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
                  {formatUSDC(r.lease.amountPerPeriod)} USDC · {r.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </Link>
            ))
        )}
      </div>
    </div>
  );
}
