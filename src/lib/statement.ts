/**
 * Shared model for the landlord Earnings and tenant Spending views — the same
 * money movements (rent released from escrow), seen from either side. A landlord
 * "receives" what a tenant "pays", so both are built from the same release
 * events and rendered by the same components, differing only in wording.
 */

import { bucketSeries } from "@/lib/earningsBuckets";
import type { ActivityItem, Lease } from "@/lib/leaseData";

export type StatementVariant = "earnings" | "spending";

export interface StatementData {
  releases: ActivityItem[]; // release events on these leases, sorted oldest → newest
  totalCumulative: number;
  monthlySeries: [string, number][];
  donutItems: { id: string; label: string; value: number }[];
  propertyRows: { id: string; propertyAddress: string; periodsReleased: number; totalPeriods: number; total: number }[];
  ledgerRows: { id: string; timestamp: number; property: string; amount: number; txHash: string | null }[];
  bestMonth: [string, number] | null;
  firstRelease?: number;
  lastRelease?: number;
}

/**
 * Builds the statement from the caller's own leases plus the full release feed.
 * The role is implicit in which leases are passed (landlord's or tenant's).
 */
export function buildStatement(leases: Lease[], releases: ActivityItem[]): StatementData {
  const ids = new Set(leases.map((l) => l.id));
  const mine = releases.filter((r) => ids.has(r.leaseId)).sort((a, b) => a.timestamp - b.timestamp);
  const leaseMap = new Map(leases.map((l) => [l.id, l] as const));

  const propertyRows = leases.map((l) => ({
    id: l.id,
    propertyAddress: l.propertyAddress,
    periodsReleased: l.periodsReleased,
    totalPeriods: l.totalPeriods,
    total: l.amountPerPeriod * l.periodsReleased,
  }));

  const donutItems = propertyRows
    .map((p) => ({ id: p.id, label: p.propertyAddress, value: p.total }))
    .filter((d) => d.value > 0);

  const totalCumulative = propertyRows.reduce((s, p) => s + p.total, 0);
  const monthlySeries = bucketSeries(mine, "monthly");
  const bestMonth = monthlySeries.reduce<[string, number] | null>(
    (best, cur) => (best === null || cur[1] > best[1] ? cur : best),
    null,
  );

  const ledgerRows = mine.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    property: leaseMap.get(r.leaseId)?.propertyAddress ?? r.leaseId,
    amount: r.amount ?? 0,
    txHash: r.txHash,
  }));

  return {
    releases: mine,
    totalCumulative,
    monthlySeries,
    donutItems,
    propertyRows,
    ledgerRows,
    bestMonth,
    firstRelease: mine[0]?.timestamp,
    lastRelease: mine[mine.length - 1]?.timestamp,
  };
}

export interface StatementLabels {
  overviewLabel: string; // header stat above the big number
  overTimeTitle: string; // section title over the charts
  mockNote: string;
  emptyReleases: string;
  breakdownEmpty: string;
  periodsWord: string; // "released" / "paid", for "N / M periods X"
  reportEyebrow: string; // small caps under the logo on the PDF
  totalTileLabel: string;
  countTileLabel: string;
  tableValueHeader: string; // per-property table amount column
  ledgerTitle: string;
  footerNote: string;
  backHref: string;
  backLabel: string;
  reportPath: string;
  granularityKeyBase: string;
  excelFilename: string;
  excelStatementTitle: string;
}

export const STATEMENT_LABELS: Record<StatementVariant, StatementLabels> = {
  earnings: {
    overviewLabel: "Cumulative received",
    overTimeTitle: "Earnings over time",
    mockNote:
      "Testnet mock mode has no per-release timestamps, so an income-over-time breakdown isn’t available — the per-property total below is still accurate.",
    emptyReleases: "No releases yet.",
    breakdownEmpty: "No landlord leases yet.",
    periodsWord: "released",
    reportEyebrow: "Earnings statement",
    totalTileLabel: "Total received",
    countTileLabel: "Releases",
    tableValueHeader: "Received",
    ledgerTitle: "Release ledger",
    footerNote:
      "All amounts in USDC, settled on the Arc network. Figures reflect rent released from escrow to the landlord and are verifiable on-chain via each transaction hash.",
    backHref: "/wallet/earnings",
    backLabel: "← Back to earnings",
    reportPath: "/reports/earnings",
    granularityKeyBase: "rentpact:earnings-granularity:v1",
    excelFilename: "rentpact-earnings.xlsx",
    excelStatementTitle: "RentPact — Earnings statement",
  },
  spending: {
    overviewLabel: "Total spent",
    overTimeTitle: "Spending over time",
    mockNote:
      "Testnet mock mode has no per-payment timestamps, so a spending-over-time breakdown isn’t available — the per-property total below is still accurate.",
    emptyReleases: "No payments yet.",
    breakdownEmpty: "No leases yet.",
    periodsWord: "paid",
    reportEyebrow: "Spending statement",
    totalTileLabel: "Total spent",
    countTileLabel: "Payments",
    tableValueHeader: "Paid",
    ledgerTitle: "Payment ledger",
    footerNote:
      "All amounts in USDC, settled on the Arc network. Figures reflect rent paid from escrow to the landlord and are verifiable on-chain via each transaction hash.",
    backHref: "/wallet/spending",
    backLabel: "← Back to spending",
    reportPath: "/reports/spending",
    granularityKeyBase: "rentpact:spending-granularity:v1",
    excelFilename: "rentpact-spending.xlsx",
    excelStatementTitle: "RentPact — Spending statement",
  },
};
