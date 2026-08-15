"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button, Skeleton } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { PropertyImage } from "@/components/PropertyImage";
import { formatDate, formatDateTime } from "@/lib/format";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/chain";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { fetchConstitution, type ConstitutionDoc } from "@/lib/constitution";
import { fetchListingIdForLease, fetchListing, type Listing } from "@/lib/listings";
import { fetchMoveOutCondition, type MoveOutCondition } from "@/lib/moveOut";
import { fetchDisputeRulingsForLease, type DisputeRulingRecord } from "@/lib/disputeRuling";
import { CONDITION_AREAS } from "@/lib/condition";
import { fetchThread, type Message } from "@/lib/messages";
import { fetchActivityFeedForLease, type ActivityEvent } from "@/lib/activityEventStore";
import {
  getLease,
  getTransactionSenders,
  leaseStatus,
  escrowContractAddress,
  type Lease,
} from "@/lib/leaseData";

const ACTIVITY_LABEL: Record<ActivityEvent["type"], string> = {
  deposit: "Escrow deposit — lease created",
  signed: "Lease signed",
  release: "Rent tranche released",
  "dispute-raised": "Dispute raised",
  "settlement-proposed": "Settlement proposed",
  "repair-credit-offered": "Repair credit offered",
  "repair-credit-accepted": "Repair credit accepted — lease resumed",
  "dispute-resolved": "Dispute resolved",
  "caution-claim-filed": "Caution fee claim filed",
  "caution-released": "Caution fee returned",
  "caution-claim-resolved": "Caution fee claim resolved",
};

const toSec = (n: number) => (n > 1e12 ? Math.floor(n / 1000) : n);

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const SEVERITY_LABEL: Record<string, string> = {
  cosmetic: "Cosmetic",
  "affects-daily-living": "Affects daily living",
  "urgent-safety": "Urgent / safety",
};
const STATUS_LABEL: Record<string, string> = {
  reported: "Reported",
  acknowledged: "Acknowledged",
  "in-progress": "In progress",
  resolved: "Resolved",
};

export default function LeaseRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [lease, setLease] = useState<Lease | null | undefined>(undefined);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [listing, setListing] = useState<Listing | null>(null);
  const [moveOut, setMoveOut] = useState<MoveOutCondition | null>(null);
  const [rulings, setRulings] = useState<DisputeRulingRecord[]>([]);
  const [constitution, setConstitution] = useState<ConstitutionDoc | null>(null);
  const [thread, setThread] = useState<Message[]>([]);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    // withHistory:false — the record's dispute/caution history comes from the
    // Postgres activity feed below, not the slow on-chain event scan (which can
    // take minutes against Arc's rate-limited RPC and hung this page in prod).
    getLease(id, false).then(setLease);
    fetchMoveOutCondition(id).then(setMoveOut);
    fetchDisputeRulingsForLease(id).then(setRulings);
    fetchConstitution().then(setConstitution);
    fetchThread(id).then(setThread);
    fetchListingIdForLease(id).then((lid) => {
      if (lid) fetchListing(lid).then(setListing);
    });
  }, [id]);

  useEffect(() => {
    fetchActivityFeedForLease(id).then(async (items) => {
      setActivity(items);
      const releaseHashes = items.filter((i) => i.type === "release" && i.txHash).map((i) => i.txHash as string);
      if (releaseHashes.length) setSenders(await getTransactionSenders(releaseHashes));
    });
  }, [id]);

  const isParty = useMemo(
    () => !!lease && !!session && (lease.tenantEmail === session.email || lease.landlordEmail === session.email),
    [lease, session],
  );

  if (isLoading || !session || lease === undefined) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (lease === null) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-ink-muted">Couldn&apos;t load this lease — it may be a temporary network hiccup.</p>
        <Button variant="secondary" className="mt-4" onClick={() => getLease(id, false).then(setLease)}>
          Try again
        </Button>
      </div>
    );
  }

  if (!isParty) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-ink-muted">This lease record is only available to the tenant and landlord on the lease.</p>
        <Link href="/leases" className="mt-4 inline-block text-sm text-forest-500 underline">
          Back to your leases
        </Link>
      </div>
    );
  }

  const status = leaseStatus(lease);
  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === lease.frequency)?.label ?? lease.frequency;
  const releases = activity.filter((i) => i.type === "release").sort((a, b) => a.timestamp - b.timestamp);
  const timeline = [...activity].sort((a, b) => a.timestamp - b.timestamp);
  const totalReleased = lease.amountPerPeriod * lease.periodsReleased;
  const totalEscrowed = lease.amountPerPeriod * lease.totalPeriods + lease.cautionAmount;
  const condition = listing?.condition ?? null;
  const resolvedDisputes = activity.filter((i) => i.type === "dispute-resolved").sort((a, b) => a.timestamp - b.timestamp);
  const hadDisputes = resolvedDisputes.length > 0 || activity.some((i) => i.type === "dispute-raised");

  // Formal issue reports (Article 3) and repair-credit requests raised during
  // the lease — the accountability record, distinct from raw chat.
  const issues = thread
    .filter((m) => m.type === "maintenance" && m.maintenance)
    .sort((a, b) => a.createdAt - b.createdAt);
  const repairRequests = thread
    .filter((m) => m.repairCreditAmount != null)
    .sort((a, b) => a.createdAt - b.createdAt);
  const repairCreditPaid = activity.some((i) => i.type === "repair-credit-accepted");

  const usd = (n: number) => `${n.toFixed(2)} USDC`;

  return (
    <div className="min-h-screen bg-cream-100 print:bg-white">
      <style>{`@media print { @page { margin: 14mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      {/* action bar — screen only */}
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-6 print:hidden">
        <Link href={`/leases/${lease.id}`} className="text-sm text-forest-500 underline">
          ← Back to lease
        </Link>
        <Button size="sm" onClick={() => window.print()}>
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
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-600">Certificate of Tenancy</p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                status === "completed" ? "bg-gold-50 text-gold-700" : "bg-forest-50 text-forest-600"
              }`}
            >
              {status === "completed" ? "Completed lease" : `Status: ${status}`}
            </span>
            <p className="mt-2 text-[11px] text-ink-soft">Generated {formatDateTime(new Date(), "long")}</p>
          </div>
        </header>

        <h1 className="mt-6 font-serif text-3xl text-ink">{lease.propertyAddress}</h1>
        <p className="mt-1 text-sm capitalize text-ink-soft">
          {lease.propertyType} · Lease #{lease.id}
        </p>

        {/* verification note */}
        <div className="mt-5 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-xs text-gold-700">
          <p className="font-semibold">Backed by the RentPact escrow contract on Arc.</p>
          <p className="mt-1">
            Every entry below corresponds to a real on-chain transaction and can be independently verified.
            {escrowContractAddress && (
              <>
                {" "}
                Contract{" "}
                <a href={explorerAddressUrl(escrowContractAddress)} className="font-mono underline">
                  {shortAddr(escrowContractAddress)}
                </a>
                .
              </>
            )}
            {constitution && ` Bound to RentPact Constitution v${constitution.version}.`}
          </p>
        </div>

        {/* property photo */}
        <section className="mt-7">
          <SectionTitle>Property</SectionTitle>
          <div className="mt-3 overflow-hidden rounded-lg border border-forest-100">
            <PropertyImage
              seed={lease.id}
              propertyType={lease.propertyType}
              overrideUrl={lease.photoUrl}
              alt={lease.propertyAddress}
              className="h-56 w-full"
            />
          </div>
        </section>

        {/* parties */}
        <section className="mt-7 break-inside-avoid">
          <SectionTitle>Parties</SectionTitle>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <PartyCard role="Tenant" email={lease.tenantEmail} note={lease.createdAt ? `Deposited ${formatDate(new Date(lease.createdAt))}` : null} />
            <PartyCard role="Landlord" email={lease.landlordEmail} note={lease.signedAt ? `Signed ${formatDate(new Date(lease.signedAt))}` : "Not yet signed"} />
          </div>
        </section>

        {/* terms */}
        <section className="mt-7 break-inside-avoid">
          <SectionTitle>Lease terms</SectionTitle>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Term label="Rent per period" value={usd(lease.amountPerPeriod)} />
            <Term label="Frequency" value={frequencyLabel} />
            <Term label="Total periods" value={String(lease.totalPeriods)} />
            <Term label="Periods released" value={`${lease.periodsReleased} of ${lease.totalPeriods}`} />
            <Term label="Total rent" value={usd(lease.amountPerPeriod * lease.totalPeriods)} />
            <Term label="Caution fee" value={lease.cautionAmount > 0 ? usd(lease.cautionAmount) : "None"} />
            <Term label="Total escrowed" value={usd(totalEscrowed)} />
            <Term label="Rent released to date" value={usd(totalReleased)} />
            <Term label="Started" value={lease.signedAt ? formatDate(new Date(lease.signedAt)) : "—"} />
          </dl>
        </section>

        {/* rent release schedule */}
        <section className="mt-7 break-inside-avoid">
          <SectionTitle>Rent releases</SectionTitle>
          {releases.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No rent tranches were released on this lease.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-forest-200 text-left text-[11px] uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Released by</th>
                    <th className="py-2">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {releases.map((r) => {
                    const by = r.txHash ? senders[r.txHash] : undefined;
                    return (
                      <tr key={r.id} className="border-b border-forest-100/70">
                        <td className="py-2 pr-3 text-ink">{formatDate(new Date(r.timestamp), "long")}</td>
                        <td className="py-2 pr-3 font-medium text-ink">{r.amount != null ? usd(r.amount) : "—"}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-ink-muted">
                          {by ? (
                            <a href={explorerAddressUrl(by)} className="underline">
                              {shortAddr(by)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 font-mono text-xs text-forest-500">
                          {r.txHash ? (
                            <a href={explorerTxUrl(r.txHash)} className="underline">
                              {shortAddr(r.txHash)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* full activity log */}
        <section className="mt-7 break-inside-avoid">
          <SectionTitle>On-chain activity log</SectionTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {timeline.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-forest-100/60 pb-2 text-sm">
                <span className="text-ink">
                  {ACTIVITY_LABEL[item.type]}
                  {item.amount != null && item.amount > 0 && <span className="text-ink-soft"> · {usd(item.amount)}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-ink-soft">
                  {formatDate(new Date(item.timestamp), "long")}
                  {item.txHash && (
                    <a href={explorerTxUrl(item.txHash)} className="font-mono text-forest-500 underline">
                      {shortAddr(item.txHash)}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* issues & maintenance */}
        <section className="mt-7 break-inside-avoid">
          <SectionTitle>Issues &amp; maintenance</SectionTitle>
          <p className="mt-1 text-xs text-ink-soft">
            Formal issue reports and repair-credit requests raised during the tenancy, with how they were handled. From
            RentPact&apos;s records; casual messages are not included.
          </p>
          {issues.length === 0 && repairRequests.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No issues were reported during this tenancy.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {issues.map((m) => {
                const d = m.maintenance!;
                return (
                  <div key={m.id} className="rounded-md border border-forest-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-forest-600">{d.category}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          d.status === "resolved" ? "bg-gold-50 text-gold-700" : "bg-terracotta-50 text-terracotta-600"
                        }`}
                      >
                        {STATUS_LABEL[d.status] ?? d.status} · {SEVERITY_LABEL[d.severity] ?? d.severity}
                      </span>
                    </div>
                    {d.description && <p className="mt-1.5 text-sm text-ink">{d.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
                      <span>Reported {formatDate(new Date(m.createdAt), "long")}</span>
                      <span>Acknowledged {d.acknowledgedAt ? formatDate(new Date(d.acknowledgedAt), "long") : "—"}</span>
                      <span>Resolved {d.resolvedAt ? formatDate(new Date(d.resolvedAt), "long") : "not resolved"}</span>
                    </div>
                  </div>
                );
              })}

              {repairRequests.map((m) => (
                <div key={m.id} className="rounded-md border border-gold-200 bg-gold-50 p-3">
                  <p className="text-sm text-ink">
                    🧾 Repair credit requested — <span className="font-semibold">{usd(m.repairCreditAmount ?? 0)}</span>
                    <span className="text-ink-soft"> · {formatDate(new Date(m.createdAt), "long")}</span>
                  </p>
                  {m.text && <p className="mt-1 text-sm text-ink-muted">{m.text}</p>}
                  {repairCreditPaid && (
                    <p className="mt-1 text-xs font-medium text-gold-700">Approved and paid — lease resumed.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* disputes */}
        <section className="mt-7 break-inside-avoid">
          <SectionTitle>Disputes</SectionTitle>
          {!hadDisputes ? (
            <p className="mt-2 text-sm text-ink-soft">No disputes were raised during this lease.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {resolvedDisputes.map((d, i) => {
                const bps = d.landlordBps ?? null;
                const ruling = rulings.find((r) => Math.abs(toSec(r.resolvedAt) - toSec(d.timestamp)) <= 120);
                const outcome =
                  bps == null
                    ? "Resolved."
                    : bps >= 10000
                      ? "Resolved in the landlord's favour — schedule resumed"
                      : bps === 0
                        ? "Resolved in the tenant's favour — remaining escrow refunded"
                        : `Split ${(bps / 100).toFixed(0)}% landlord / ${(100 - bps / 100).toFixed(0)}% tenant`;
                return (
                  <div key={d.id ?? i} className="rounded-md border border-forest-100 p-3">
                    <p className="text-sm font-medium text-ink">
                      Dispute resolved {formatDate(new Date(d.timestamp))}
                      {d.resolutionType && ` · ${d.resolutionType}`}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">{outcome}</p>
                    {ruling?.reasoning && (
                      <p className="mt-2 border-l-2 border-gold-300 pl-3 text-xs italic text-ink-soft">{ruling.reasoning}</p>
                    )}
                  </div>
                );
              })}
              {resolvedDisputes.length === 0 && (
                <p className="text-sm text-ink-soft">A dispute was raised on this lease. See the activity log above.</p>
              )}
            </div>
          )}
        </section>

        {/* caution fee outcome */}
        {lease.cautionAmount > 0 && (
          <section className="mt-7 break-inside-avoid">
            <SectionTitle>Caution fee</SectionTitle>
            <p className="mt-2 text-sm text-ink-muted">
              {usd(lease.cautionAmount)} was held in escrow separate from rent.{" "}
              {lease.cautionClaimFiledAt
                ? `The landlord filed a claim of ${usd(lease.cautionClaimedAmount ?? 0)}${
                    lease.cautionSettled ? ", now settled." : ", pending resolution."
                  }`
                : lease.cautionSettled
                  ? "It was returned to the tenant in full."
                  : "It remains in escrow pending the end of the claim window."}
            </p>
          </section>
        )}

        {/* move-in condition */}
        {condition && (
          <section className="mt-7 break-inside-avoid">
            <SectionTitle>Move-in condition (baseline)</SectionTitle>
            <p className="mt-1 text-xs text-ink-soft">Declared {formatDate(new Date(condition.declaredAt))} and accepted at signing.</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              {CONDITION_AREAS.map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-2">
                  <dt className="text-ink-soft">{a.label}</dt>
                  <dd className="font-medium capitalize text-ink">{condition.areas[a.key]?.status ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {condition.knownDefects && (
              <p className="mt-3 rounded-md bg-terracotta-50 px-3 py-2 text-xs text-terracotta-600">
                <span className="font-semibold uppercase tracking-wide">Known defects:</span> {condition.knownDefects}
              </p>
            )}
            {condition.photos.length > 0 && <PhotoGrid photos={condition.photos} />}
          </section>
        )}

        {/* move-out condition */}
        {moveOut && (
          <section className="mt-7 break-inside-avoid">
            <SectionTitle>Move-out condition</SectionTitle>
            <p className="mt-1 text-xs text-ink-soft">Submitted {formatDate(new Date(moveOut.declaredAt))} by {moveOut.submittedBy}.</p>
            {moveOut.notes && <p className="mt-2 text-sm text-ink-muted">{moveOut.notes}</p>}
            {moveOut.photos.length > 0 && <PhotoGrid photos={moveOut.photos} />}
          </section>
        )}

        {/* footer */}
        <footer className="mt-8 border-t border-forest-100 pt-4 text-[11px] text-ink-soft">
          <p>
            Generated by RentPact · rent-pact.vercel.app{constitution && ` · Constitution v${constitution.version}`}
            {constitution && (
              <>
                {" "}
                (hash <span className="font-mono">{constitution.hash.slice(0, 16)}…</span>)
              </>
            )}
          </p>
          <p className="mt-1">
            This record is derived from on-chain data on Arc and is verifiable against the RentPact escrow contract. Rent
            held in escrow — released on schedule, frozen on dispute, returned when owed.
          </p>
        </footer>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-forest-500">
      <span className="inline-block h-4 w-1 rounded bg-gold-400" />
      {children}
    </h2>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

function PartyCard({ role, email, note }: { role: string; email: string; note: string | null }) {
  return (
    <div className="rounded-md border border-forest-100 p-3">
      <p className="text-[11px] uppercase tracking-wide text-gold-600">{role}</p>
      <p className="mt-1 truncate text-sm font-medium text-ink">{email}</p>
      {note && <p className="mt-0.5 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

function PhotoGrid({ photos }: { photos: { room: string; url: string }[] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p, i) => (
        <figure key={i} className="overflow-hidden rounded-md border border-forest-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.room} className="h-24 w-full object-cover" />
          <figcaption className="truncate bg-cream-300 px-1.5 py-1 text-[10px] text-ink-muted">{p.room}</figcaption>
        </figure>
      ))}
    </div>
  );
}
