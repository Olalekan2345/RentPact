/**
 * Time-bucketing helpers for landlord earnings — shared by the Earnings tab
 * chart and the printable earnings report so both group releases identically.
 */

export type Granularity = "weekly" | "monthly";

export function monthKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/** Monday 00:00 of the week a timestamp falls in — the bucket key for weekly grouping. */
export function weekKey(timestamp: number): string {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0, …
  d.setDate(d.getDate() - mondayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Groups release amounts into sorted [bucketKey, total] pairs at the given granularity. */
export function bucketSeries(
  releases: { timestamp: number; amount: number | null }[],
  granularity: Granularity,
): [string, number][] {
  const keyFn = granularity === "weekly" ? weekKey : monthKey;
  const buckets = new Map<string, number>();
  for (const r of releases) {
    const key = keyFn(r.timestamp);
    buckets.set(key, (buckets.get(key) ?? 0) + (r.amount ?? 0));
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
}
