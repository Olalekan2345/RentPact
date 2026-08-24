"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { CumulativeGrowthChart } from "@/components/earnings/CumulativeGrowthChart";
import { PropertyDonut } from "@/components/earnings/PropertyDonut";
import { formatDate, formatDateTime } from "@/lib/format";
import { MOCK_MODE } from "@/lib/circle";
import { monthLabel } from "@/lib/earningsBuckets";
import { STATEMENT_LABELS, type StatementData, type StatementVariant } from "@/lib/statement";

/**
 * The shared printable statement for landlord Earnings and tenant Spending.
 * Prints clean because AppShell chrome and the action bar are print:hidden.
 */

const usd = (n: number) => `${n.toFixed(2)} USDC`;
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

export function StatementDocument({
  variant,
  email,
  data,
  loading,
}: {
  variant: StatementVariant;
  email: string;
  data: StatementData;
  loading: boolean;
}) {
  const labels = STATEMENT_LABELS[variant];

  return (
    <div className="min-h-screen bg-cream-100 print:bg-white">
      <style>{`@media print { @page { margin: 14mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      {/* action bar — screen only */}
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-6 print:hidden">
        <Link href={labels.backHref} className="text-sm text-forest-500 underline">
          {labels.backLabel}
        </Link>
        <Button size="sm" onClick={() => window.print()} disabled={loading}>
          Download as PDF
        </Button>
      </div>

      {/* ── the document ── */}
      <div className="mx-auto my-6 max-w-4xl bg-white px-8 py-10 shadow-card print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none sm:px-12">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest-500 pb-5">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div>
              <p className="font-serif text-xl font-semibold text-forest-500">RentPact</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-600">{labels.reportEyebrow}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink">{email}</p>
            <p className="mt-1 text-[11px] text-ink-soft">Generated {formatDateTime(new Date(), "long")}</p>
            {data.firstRelease && data.lastRelease && (
              <p className="text-[11px] text-ink-soft">
                {formatDate(new Date(data.firstRelease), "long")} – {formatDate(new Date(data.lastRelease), "long")}
              </p>
            )}
          </div>
        </header>

        {loading ? (
          <p className="py-16 text-center text-sm text-ink-soft">Preparing your report…</p>
        ) : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label={labels.totalTileLabel} value={usd(data.totalCumulative)} />
              <SummaryTile label="Properties" value={String(data.donutItems.length)} />
              <SummaryTile label={labels.countTileLabel} value={String(data.releases.length)} />
              <SummaryTile label="Best month" value={data.bestMonth ? usd(data.bestMonth[1]) : "—"} />
            </section>

            {data.monthlySeries.length >= 2 && (
              <section className="mt-8">
                <CumulativeGrowthChart series={data.monthlySeries} labelFor={monthLabel} />
              </section>
            )}

            {data.donutItems.length > 0 && (
              <section className="mt-6">
                <PropertyDonut items={data.donutItems} />
              </section>
            )}

            <section className="mt-8">
              <SectionHeading>Per-property breakdown</SectionHeading>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-forest-100 text-left text-xs uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-3 font-medium">Property</th>
                    <th className="py-2 pr-3 font-medium">Periods</th>
                    <th className="py-2 text-right font-medium">{labels.tableValueHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.propertyRows.map((p) => (
                    <tr key={p.id} className="border-b border-forest-100/60">
                      <td className="py-2 pr-3 text-ink">{p.propertyAddress}</td>
                      <td className="py-2 pr-3 text-ink-muted">
                        {p.periodsReleased} / {p.totalPeriods}
                      </td>
                      <td className="py-2 text-right font-medium text-ink">{usd(p.total)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-forest-500">
                    <td className="py-2 pr-3 font-semibold text-ink" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2 text-right font-semibold text-forest-500">{usd(data.totalCumulative)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {!MOCK_MODE && data.ledgerRows.length > 0 && (
              <section className="mt-8">
                <SectionHeading>{labels.ledgerTitle}</SectionHeading>
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
                    {data.ledgerRows.map((r) => (
                      <tr key={r.id} className="border-b border-forest-100/60">
                        <td className="py-2 pr-3 text-ink-muted">{formatDate(new Date(r.timestamp), "long")}</td>
                        <td className="py-2 pr-3 text-ink">{r.property}</td>
                        <td className="py-2 pr-3 text-right font-medium text-ink">{usd(r.amount)}</td>
                        <td className="py-2 font-mono text-[11px] text-ink-soft">{r.txHash ? shortHash(r.txHash) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <footer className="mt-10 border-t border-forest-100 pt-4 text-[11px] text-ink-soft">{labels.footerNote}</footer>
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
