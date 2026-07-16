"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Badge, Skeleton } from "@/components/ui";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { formatDate, formatUSDC } from "@/lib/format";
import { explorerTxUrl } from "@/lib/chain";
import {
  getActivityFeed,
  listLeasesForTenant,
  listLeasesForLandlord,
  type ActivityItem,
  type Lease,
} from "@/lib/leaseData";

const MONEY_TYPES: ActivityItem["type"][] = ["deposit", "release", "dispute-resolved", "cancelled"];

type RowType = ActivityItem["type"] | "withdrawal";

const TYPE_FILTERS: { value: RowType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "deposit", label: "Deposits" },
  { value: "release", label: "Releases" },
  { value: "dispute-resolved", label: "Refunds" },
  { value: "cancelled", label: "Cancellations" },
  { value: "withdrawal", label: "Withdrawals" },
];

const DATE_FILTERS = [
  { value: "all", label: "All time" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

interface DisplayRow {
  id: string;
  type: RowType;
  timestamp: number;
  label: string;
  direction: "in" | "out" | "neutral";
  amount: number | null;
  txHash: string | null;
  leaseId: string | null;
  subtitle: ReactNode;
}

function describeMoneyEvent(item: ActivityItem, role: "tenant" | "landlord" | null) {
  if (item.type === "deposit") {
    return role === "landlord"
      ? { label: "Tenant deposited into escrow", direction: "neutral" as const }
      : { label: "Deposited into escrow", direction: "out" as const };
  }
  if (item.type === "release") {
    return role === "landlord"
      ? { label: "Tranche received", direction: "in" as const }
      : { label: "Tranche released to landlord", direction: "out" as const };
  }
  if (item.type === "dispute-resolved") {
    const refundedToTenant = (item.amount ?? 0) > 0;
    if (refundedToTenant) {
      return role === "landlord"
        ? { label: "Dispute refund sent to tenant", direction: "out" as const }
        : { label: "Dispute refund received", direction: "in" as const };
    }
    return role === "landlord"
      ? { label: "Dispute funds released to you", direction: "in" as const }
      : { label: "Dispute funds released to landlord", direction: "out" as const };
  }
  if (item.type === "cancelled") {
    return role === "landlord"
      ? { label: "Lease cancelled — tenant refunded", direction: "neutral" as const }
      : { label: "Lease cancelled — refunded", direction: "in" as const };
  }
  return { label: item.type, direction: "neutral" as const };
}

const DIRECTION_STYLE: Record<"in" | "out" | "neutral", string> = {
  in: "text-forest-500",
  out: "text-terracotta-500",
  neutral: "text-ink-muted",
};

export default function TransactionsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [transfers, setTransfers] = useState<{ id: string; toAddress: string; amount: number; txHash: string; createdAt: number }[] | null>(null);
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [leaseFilter, setLeaseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<RowType | "all">("all");
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]["value"]>("all");

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    getActivityFeed(session, 500).then(setActivity);
    Promise.all([listLeasesForTenant(session, false), listLeasesForLandlord(session, false)]).then(([tenant, landlord]) => {
      setLeases([...tenant, ...landlord]);
    });
    fetch(`/api/wallet-transfers?forEmail=${encodeURIComponent(session.email)}`)
      .then((res) => res.json())
      .then((data) => setTransfers(data.transfers ?? []))
      .catch(() => setTransfers([]));
  }, [session]);

  const leaseMap = useMemo(() => {
    const map = new Map<string, Lease>();
    for (const l of leases ?? []) map.set(l.id, l);
    return map;
  }, [leases]);

  const rows = useMemo<DisplayRow[] | null>(() => {
    if (!activity || !transfers || !session) return null;
    const cutoff = dateFilter === "all" ? null : Date.now() - Number(dateFilter) * 86_400_000;

    const activityRows: DisplayRow[] = activity
      .filter((item) => MONEY_TYPES.includes(item.type))
      .map((item) => {
        const lease = leaseMap.get(item.leaseId) ?? null;
        const role: "tenant" | "landlord" | null = lease
          ? lease.tenantEmail === session.email
            ? "tenant"
            : "landlord"
          : null;
        const counterparty = lease ? (role === "tenant" ? lease.landlordEmail : lease.tenantEmail) : "—";
        const { label, direction } = describeMoneyEvent(item, role);
        return {
          id: item.id,
          type: item.type,
          timestamp: item.timestamp,
          label,
          direction,
          amount: item.amount,
          txHash: item.txHash,
          leaseId: item.leaseId,
          subtitle: (
            <>
              {lease ? (
                <Link href={`/leases/${lease.id}`} className="underline">
                  {lease.propertyAddress}
                </Link>
              ) : (
                "Unknown lease"
              )}
              {" · "}
              {counterparty}
              {" · "}
              {formatDate(new Date(item.timestamp), "long")}
            </>
          ),
        };
      });

    const transferRows: DisplayRow[] = transfers.map((t) => ({
      id: t.id,
      type: "withdrawal",
      timestamp: t.createdAt,
      label: "Sent from wallet",
      direction: "out",
      amount: t.amount,
      txHash: t.txHash,
      leaseId: null,
      subtitle: (
        <>
          To {t.toAddress.slice(0, 6)}…{t.toAddress.slice(-4)}
          {" · "}
          {formatDate(new Date(t.createdAt), "long")}
        </>
      ),
    }));

    return [...activityRows, ...transferRows]
      .filter((row) => leaseFilter === "all" || row.leaseId === leaseFilter)
      .filter((row) => typeFilter === "all" || row.type === typeFilter)
      .filter((row) => cutoff === null || row.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [activity, transfers, leaseMap, leaseFilter, typeFilter, dateFilter, session]);

  if (isLoading || !session) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <select
          value={leaseFilter}
          onChange={(e) => setLeaseFilter(e.target.value)}
          className="h-10 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink"
        >
          <option value="all">All leases</option>
          {(leases ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.propertyAddress}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as RowType | "all")}
          className="h-10 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink"
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as (typeof DATE_FILTERS)[number]["value"])}
          className="h-10 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink"
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {rows === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">No transactions match these filters.</p>
      ) : (
        <div className="flex flex-col divide-y divide-forest-100 rounded-lg border border-forest-100/60 bg-cream-100">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{row.label}</p>
                <p className="mt-0.5 truncate text-xs text-ink-soft">{row.subtitle}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {row.amount !== null && (
                  <span className={`flex items-center gap-1 text-sm font-semibold ${DIRECTION_STYLE[row.direction]}`}>
                    {row.direction === "out" ? "-" : row.direction === "in" ? "+" : ""}
                    <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
                    {formatUSDC(row.amount)} USDC
                  </span>
                )}
                {row.txHash ? (
                  <a
                    href={explorerTxUrl(row.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-forest-500 underline"
                  >
                    {row.txHash.slice(0, 6)}…{row.txHash.slice(-4)}
                  </a>
                ) : (
                  <Badge variant="neutral">Recorded</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
