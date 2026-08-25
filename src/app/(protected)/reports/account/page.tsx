"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { formatDate, formatDateTime } from "@/lib/format";
import { exportAccountData } from "@/lib/account";

/**
 * A human-readable "account data summary" — the same data as the JSON export,
 * laid out to actually read and print. JSON stays the portable/backup format;
 * this is the readable companion. Prints clean (AppShell chrome + action bar
 * are print:hidden), same pattern as the statement reports.
 */

interface AccountExport {
  exportedAt?: string;
  email?: string;
  profile?: { email?: string; name?: string | null; memberSince?: number } | null;
  listings?: {
    id: string;
    propertyAddress?: string;
    propertyType?: string;
    amountPerPeriod?: number;
    frequency?: string;
    active?: boolean;
    createdAt?: number;
  }[];
  reviewsReceived?: { id: string; fromEmail?: string; rating?: number; comment?: string; createdAt?: number }[];
  messages?: { id: string; fromEmail?: string; toEmail?: string; createdAt?: number }[];
  notificationPrefs?: Record<string, boolean> | null;
  privacyPrefs?: { showReputation?: boolean; showRentalHistory?: boolean; showReviews?: boolean } | null;
}

const usd = (n?: number) => `${(n ?? 0).toFixed(2)} USDC`;
const onOff = (b?: boolean) => (b ? "On" : "Off");
const NOTIF_LABELS: Record<string, string> = {
  money: "Money events",
  lease: "Lease lifecycle",
  maintenance: "Maintenance",
  dispute: "Disputes",
  messages: "Messages & reviews",
};

export default function AccountReportPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AccountExport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    exportAccountData(session.email)
      .then((d) => setData(d as AccountExport))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your data."));
  }, [session]);

  if (isLoading || !session) return null;

  const loading = data === null && error === null;
  const listings = data?.listings ?? [];
  const reviews = data?.reviewsReceived ?? [];
  const messages = data?.messages ?? [];
  const email = session.email;
  const sent = messages.filter((m) => m.fromEmail === email).length;
  const received = messages.filter((m) => m.toEmail === email).length;
  const msgDates = messages.map((m) => m.createdAt ?? 0).filter(Boolean).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-cream-100 print:bg-white">
      <style>{`@media print { @page { margin: 14mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-6 print:hidden">
        <Link href="/settings/legal" className="text-sm text-forest-500 underline">
          ← Back to settings
        </Link>
        <Button size="sm" onClick={() => window.print()} disabled={loading}>
          Download as PDF
        </Button>
      </div>

      <div className="mx-auto my-6 max-w-4xl bg-white px-8 py-10 shadow-card print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none sm:px-12">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest-500 pb-5">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div>
              <p className="font-serif text-xl font-semibold text-forest-500">RentPact</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-600">Account data summary</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink">{email}</p>
            <p className="mt-1 text-[11px] text-ink-soft">Generated {formatDateTime(new Date(), "long")}</p>
          </div>
        </header>

        {error ? (
          <p className="py-16 text-center text-sm text-terracotta-500">{error}</p>
        ) : loading ? (
          <p className="py-16 text-center text-sm text-ink-soft">Preparing your summary…</p>
        ) : (
          <>
            {/* Profile */}
            <section className="mt-6">
              <SectionHeading>Profile</SectionHeading>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <Field label="Name" value={data?.profile?.name || "—"} />
                <Field label="Email" value={data?.profile?.email || email} />
                <Field
                  label="Member since"
                  value={data?.profile?.memberSince ? formatDate(new Date(data.profile.memberSince), "long") : "—"}
                />
              </dl>
            </section>

            {/* Listings */}
            <section className="mt-8">
              <SectionHeading>Your listings ({listings.length})</SectionHeading>
              {listings.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">No listings.</p>
              ) : (
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-forest-100 text-left text-xs uppercase tracking-wide text-ink-soft">
                      <th className="py-2 pr-3 font-medium">Property</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 text-right font-medium">Rent</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium">Listed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((l) => (
                      <tr key={l.id} className="border-b border-forest-100/60">
                        <td className="py-2 pr-3 text-ink">{l.propertyAddress || "—"}</td>
                        <td className="py-2 pr-3 text-ink-muted">{l.propertyType || "—"}</td>
                        <td className="py-2 pr-3 text-right text-ink">
                          {usd(l.amountPerPeriod)}
                          {l.frequency ? <span className="text-ink-soft"> / {l.frequency}</span> : null}
                        </td>
                        <td className="py-2 pr-3 text-ink-muted">{l.active ? "Live" : "Rented / inactive"}</td>
                        <td className="py-2 text-ink-muted">
                          {l.createdAt ? formatDate(new Date(l.createdAt), "long") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Reviews received */}
            <section className="mt-8">
              <SectionHeading>Reviews received ({reviews.length})</SectionHeading>
              {reviews.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">No reviews yet.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="border-b border-forest-100/60 pb-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gold-600" aria-label={`${r.rating ?? 0} out of 5`}>
                          {"★".repeat(Math.round(r.rating ?? 0))}
                          <span className="text-forest-100">{"★".repeat(Math.max(0, 5 - Math.round(r.rating ?? 0)))}</span>
                        </span>
                        <span className="text-[11px] text-ink-soft">
                          {r.createdAt ? formatDate(new Date(r.createdAt), "long") : ""}
                        </span>
                      </div>
                      {r.comment ? <p className="mt-1 text-ink">{r.comment}</p> : null}
                      {r.fromEmail ? <p className="mt-0.5 text-[11px] text-ink-soft">from {r.fromEmail}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Messages summary */}
            <section className="mt-8">
              <SectionHeading>Messages</SectionHeading>
              <p className="mt-2 text-sm text-ink-muted">
                {messages.length} message{messages.length === 1 ? "" : "s"} in total — {sent} sent, {received}{" "}
                received
                {msgDates.length > 0 && (
                  <>
                    {" "}
                    between {formatDate(new Date(msgDates[0]), "long")} and{" "}
                    {formatDate(new Date(msgDates[msgDates.length - 1]), "long")}
                  </>
                )}
                .
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                Full message text is included in the JSON export (Settings → Legal & data).
              </p>
            </section>

            {/* Preferences */}
            <section className="mt-8">
              <SectionHeading>Preferences</SectionHeading>
              <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Notifications</p>
                  <dl className="mt-2 flex flex-col gap-1 text-sm">
                    {Object.entries(NOTIF_LABELS).map(([key, label]) => (
                      <div key={key} className="flex justify-between">
                        <dt className="text-ink-muted">{label}</dt>
                        <dd className="font-medium text-ink">{onOff(data?.notificationPrefs?.[key])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Privacy</p>
                  <dl className="mt-2 flex flex-col gap-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Show reputation</dt>
                      <dd className="font-medium text-ink">{onOff(data?.privacyPrefs?.showReputation)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Show rental history</dt>
                      <dd className="font-medium text-ink">{onOff(data?.privacyPrefs?.showRentalHistory)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Show reviews</dt>
                      <dd className="font-medium text-ink">{onOff(data?.privacyPrefs?.showReviews)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>

            <footer className="mt-10 border-t border-forest-100 pt-4 text-[11px] text-ink-soft">
              This is a readable summary of the personal data RentPact holds for your account. The complete,
              machine-readable copy is available as a JSON download under Settings → Legal &amp; data. Lease and
              on-chain financial records are shared with the other party to each lease and are retained as part
              of that transaction record.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-500">{children}</h2>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-forest-100/60 py-1.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
