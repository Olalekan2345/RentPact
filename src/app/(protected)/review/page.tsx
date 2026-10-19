"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Badge, Button, Card, CardContent, SegmentedControl, Skeleton } from "@/components/ui";
import {
  fetchMyVerification,
  fetchReviewQueue,
  submitReviewDecision,
  type ReviewQueue,
  type SignedDocument,
} from "@/lib/verification";
import {
  ID_TYPES,
  LANDLORD_CHECKS,
  PROPERTY_CHECKS,
  TITLE_DOCUMENT_TYPES,
  requiredChecks,
  type CheckItem,
  type LandlordRole,
} from "@/lib/verificationModel";

type Tab = "landlords" | "properties" | "reports" | "verified";

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const DOC_LABEL: Record<string, string> = {
  id: "ID",
  lasrera: "LASRERA certificate",
  title: "Title document",
  bill: "Bill for the address",
  authority: "Letter of authority",
};

/** Nigerian numbers written locally (0803…) → international, for a WhatsApp link. */
const whatsapp = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? `234${digits.slice(1)}` : digits}`;
};

/**
 * The RentPact review team's queue (REVIEWER_EMAILS — the arbiter account to start with). Every approval
 * needs its checklist ticked, and every rejection a reason the landlord will see.
 */
export default function ReviewPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("landlords");

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  const load = useCallback(() => {
    fetchReviewQueue()
      .then((q) => {
        setQueue(q);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load the review queue."));
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchMyVerification().then((r) => {
      const ok = r?.isReviewer === true;
      setAllowed(ok);
      if (ok) load();
    });
  }, [session, load]);

  if (isLoading || !session || allowed === undefined) return null;
  if (!allowed) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">Only the RentPact review team can see this page.</div>;
  }

  const counts = {
    landlords: queue?.landlords.length ?? 0,
    properties: queue?.properties.length ?? 0,
    reports: queue?.reports.length ?? 0,
    verified: queue?.verifiedLandlords.length ?? 0,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <h1 className="text-3xl text-ink">Review queue</h1>
      <p className="mt-1 text-ink-muted">Verify landlords and their properties before tenants can see them.</p>
      <p className="mt-3 rounded-md bg-gold-50 px-4 py-3 text-xs text-gold-700">
        This account is also the dispute arbiter. If you later rule on a dispute involving a landlord or property you
        approved here, say so in your ruling.
      </p>

      <div className="mt-6 overflow-x-auto">
        <SegmentedControl
          options={[
            { value: "landlords", label: `Landlords (${counts.landlords})` },
            { value: "properties", label: `Properties (${counts.properties})` },
            { value: "reports", label: `Reports (${counts.reports})` },
            { value: "verified", label: `Verified (${counts.verified})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {loadError && <p className="text-sm text-terracotta-500">{loadError}</p>}
        {queue === null && !loadError ? (
          <Skeleton className="h-48 w-full" />
        ) : queue === null ? null : tab === "landlords" ? (
          queue.landlords.length === 0 ? (
            <Empty>No landlord applications waiting.</Empty>
          ) : (
            queue.landlords.map((l) => (
              <Card key={l.email}>
                <CardContent className="flex flex-col gap-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{l.fullName}</p>
                      <p className="text-sm text-ink-soft">{l.email}</p>
                    </div>
                    <Badge variant={l.role === "agent" ? "gold" : "forest"}>{l.role === "agent" ? "Agent / caretaker" : "Owner"}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Phone">
                      <a href={`tel:${l.phone}`} className="text-forest-500 underline">
                        {l.phone}
                      </a>{" "}
                      ·{" "}
                      <a href={whatsapp(l.phone)} target="_blank" rel="noreferrer" className="text-forest-500 underline">
                        WhatsApp
                      </a>
                    </Field>
                    <Field label="ID type">{ID_TYPES.find((t) => t.value === l.idType)?.label ?? l.idType}</Field>
                    {l.lasreraNumber && <Field label="LASRERA no.">{l.lasreraNumber}</Field>}
                    <Field label="Sent">{day(l.submittedAt)}</Field>
                  </dl>
                  <Documents docs={l.documents} />
                  <Decide
                    checks={LANDLORD_CHECKS}
                    role={l.role}
                    onDecide={(decision, note, checks) => submitReviewDecision({ target: "landlord", id: l.email, decision, note, checks })}
                    onDone={load}
                  />
                </CardContent>
              </Card>
            ))
          )
        ) : tab === "properties" ? (
          queue.properties.length === 0 ? (
            <Empty>No properties waiting.</Empty>
          ) : (
            queue.properties.map((p) => (
              <Card key={p.listingId}>
                <CardContent className="flex flex-col gap-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/listings/${p.listingId}`} className="font-semibold text-forest-500 underline">
                        {p.propertyAddress}
                      </Link>
                      <p className="text-sm capitalize text-ink-soft">{p.propertyType}</p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-soft">Sent {day(p.submittedAt)}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Landlord">{p.landlordName ?? p.landlordEmail}</Field>
                    <Field label="Role">{p.landlordRole === "agent" ? "Agent / caretaker" : "Owner"}</Field>
                    {p.landlordPhone && (
                      <Field label="Phone">
                        <a href={whatsapp(p.landlordPhone)} target="_blank" rel="noreferrer" className="text-forest-500 underline">
                          {p.landlordPhone} (WhatsApp)
                        </a>
                      </Field>
                    )}
                    <Field label="Title">{TITLE_DOCUMENT_TYPES.find((t) => t.value === p.titleDocumentType)?.label ?? "—"}</Field>
                  </dl>
                  <Documents docs={p.documents} />
                  <Decide
                    checks={PROPERTY_CHECKS}
                    role={p.landlordRole}
                    onDecide={(decision, note, checks) => submitReviewDecision({ target: "listing", id: p.listingId, decision, note, checks })}
                    onDone={load}
                  />
                </CardContent>
              </Card>
            ))
          )
        ) : tab === "reports" ? (
          queue.reports.length === 0 ? (
            <Empty>No open reports.</Empty>
          ) : (
            queue.reports.map((r) => <ReportCard key={r.id} report={r} onDone={load} />)
          )
        ) : queue.verifiedLandlords.length === 0 ? (
          <Empty>No verified landlords yet.</Empty>
        ) : (
          queue.verifiedLandlords.map((v) => <VerifiedCard key={v.email} landlord={v} onDone={load} />)
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-forest-100 bg-cream-100 px-4 py-8 text-center text-sm text-ink-soft">{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Documents({ docs }: { docs: SignedDocument[] }) {
  if (docs.length === 0) return <p className="text-sm text-terracotta-500">No documents attached.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {docs.map((d) =>
        d.url ? (
          <a
            key={d.path}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-forest-200 px-3 py-1 text-xs font-medium text-forest-500 hover:bg-forest-50"
          >
            {DOC_LABEL[d.kind] ?? d.kind} ↗
          </a>
        ) : (
          <span key={d.path} className="rounded-full bg-cream-400 px-3 py-1 text-xs text-ink-soft">
            {DOC_LABEL[d.kind] ?? d.kind} (unavailable)
          </span>
        ),
      )}
    </div>
  );
}

/** Checklist + note + approve / reject. Approve unlocks only when every required check is ticked. */
function Decide({
  checks,
  role,
  onDecide,
  onDone,
}: {
  checks: CheckItem[];
  role: LandlordRole | null;
  onDecide: (decision: "approve" | "reject", note: string, checks: Record<string, boolean>) => Promise<void>;
  onDone: () => void;
}) {
  const items = checks.filter((c) => !c.agentOnly || role === "agent");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canApprove = requiredChecks(checks, role).every((k) => ticked[k]);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(decision, note, ticked);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that decision.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-forest-100 pt-4">
      {items.map((c) => (
        <label key={c.key} className="flex items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={ticked[c.key] === true}
            onChange={(e) => setTicked((t) => ({ ...t, [c.key]: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-forest-200"
          />
          <span>
            {c.label}
            {c.optional && <span className="text-ink-soft"> (optional)</span>}
          </span>
        </label>
      ))}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Reason, shown to the landlord if you send it back"
        className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
      />
      {error && <p className="text-sm text-terracotta-500">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide("approve")} disabled={busy || !canApprove}>
          Approve
        </Button>
        <Button size="sm" variant="destructive" onClick={() => decide("reject")} disabled={busy || note.trim().length < 5}>
          Send back
        </Button>
      </div>
    </div>
  );
}

function ReportCard({ report, onDone }: { report: ReviewQueue["reports"][number]; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (decision: "dismiss" | "take-down" | "revoke-landlord") => {
    setBusy(true);
    setError(null);
    try {
      await submitReviewDecision({ target: "report", id: report.id, decision, note });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that decision.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/listings/${report.listingId}`} className="font-semibold text-forest-500 underline">
            {report.propertyAddress}
          </Link>
          <Badge variant={report.listingActive ? "terracotta" : "neutral"}>{report.listingActive ? "Live" : "Not live"}</Badge>
        </div>
        <p className="text-sm text-ink">&ldquo;{report.reason}&rdquo;</p>
        <p className="text-xs text-ink-soft">
          From {report.reporterEmail} · {day(report.createdAt)} · Landlord {report.landlordEmail}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note (sent to the landlord if you revoke them)"
          className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
        />
        {error && <p className="text-sm text-terracotta-500">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => act("dismiss")} disabled={busy}>
            Dismiss
          </Button>
          <Button size="sm" variant="outline" onClick={() => act("take-down")} disabled={busy}>
            Take listing down
          </Button>
          <Button size="sm" variant="destructive" onClick={() => act("revoke-landlord")} disabled={busy}>
            Revoke landlord
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VerifiedCard({ landlord, onDone }: { landlord: ReviewQueue["verifiedLandlords"][number]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitReviewDecision({ target: "landlord", id: landlord.email, decision: "revoke", note });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">{landlord.fullName}</p>
            <p className="text-sm text-ink-soft">{landlord.email}</p>
          </div>
          <span className="text-xs text-ink-soft">
            {landlord.reviewedAt ? `Verified ${day(landlord.reviewedAt)}` : "Verified"}
            {landlord.reviewedBy ? ` by ${landlord.reviewedBy}` : ""}
          </span>
        </div>
        {open ? (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Why — the landlord will see this. All their listings come down."
              className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
            />
            {error && <p className="text-sm text-terracotta-500">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={revoke} disabled={busy || note.trim().length < 5}>
                Revoke verification
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-medium text-terracotta-500 underline">
            Revoke…
          </button>
        )}
      </CardContent>
    </Card>
  );
}
