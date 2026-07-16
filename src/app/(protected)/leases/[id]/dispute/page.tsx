"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { FrostIcon, ScaleIcon, CheckIcon } from "@/components/icons/TimelineIcons";
import { Badge, Button, Card, CardContent, Skeleton } from "@/components/ui";
import { formatDate, formatUSDC } from "@/lib/format";
import { UsdcAmount } from "@/components/UsdcAmount";
import { EvidenceTimeline } from "@/components/EvidenceTimeline";
import { buildEvidenceTimeline, parseIssueReference } from "@/lib/evidenceTimeline";
import { explorerTxUrl } from "@/lib/chain";
import {
  getLease,
  resolveDispute,
  proposeSettlement,
  acceptSettlement,
  autoResolveOverdueDispute,
  getLeaseActivity,
  type Lease,
} from "@/lib/leaseData";
import { fetchThread, sendTextMessage, type Message } from "@/lib/messages";
import { fetchListingIdForLease, fetchListing, type Listing } from "@/lib/listings";
import { fetchDisputeRulingsForLease, type DisputeRulingRecord } from "@/lib/disputeRuling";
import { checkTier0 } from "@/lib/tier0";
import { SETTLEMENT_WINDOW_MS, ARBITRATION_WINDOW_MS, DAY_MS } from "@/lib/constitution";

const BPS_DENOMINATOR = 10_000;

function ProgressBar({ fraction, tone = "gold" }: { fraction: number; tone?: "gold" | "terracotta" }) {
  const barColor = tone === "gold" ? "bg-gold-400" : "bg-terracotta-400";
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-300">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }} />
    </div>
  );
}

export default function DisputePanelPage() {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [lease, setLease] = useState<Lease | null | undefined>(undefined);
  const [thread, setThread] = useState<Message[]>([]);
  const [sourceListing, setSourceListing] = useState<Listing | null>(null);
  const [rulings, setRulings] = useState<DisputeRulingRecord[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposedPct, setProposedPct] = useState(50);
  const [arbiterPct, setArbiterPct] = useState(50);
  const [reasoning, setReasoning] = useState("");
  const [statement, setStatement] = useState("");
  const [statementSent, setStatementSent] = useState(false);
  const [constitutionOpen, setConstitutionOpen] = useState(false);

  const refresh = useCallback(() => {
    getLease(id).then(setLease);
    fetchThread(id).then(setThread);
    fetchDisputeRulingsForLease(id).then(setRulings);
    getLeaseActivity(id).then((items) => {
      const resolved = items.find((i) => i.type === "dispute-resolved");
      setTxHash(resolved?.txHash ?? null);
    });
  }, [id]);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    fetchListingIdForLease(id).then((listingId) => {
      if (!listingId) return;
      fetchListing(listingId).then(setSourceListing);
    });
  }, [id]);

  const role: "tenant" | "landlord" | null = useMemo(() => {
    if (!lease || !session) return null;
    if (session.email === lease.tenantEmail) return "tenant";
    if (session.email === lease.landlordEmail) return "landlord";
    return null;
  }, [lease, session]);

  if (isLoading || !session || lease === undefined) {
    return (
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
          <Skeleton className="h-64 w-full" />
        </div>
    );
  }

  if (lease === null) {
    return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">Lease not found.</div>
    );
  }

  const lastResolution = lease.resolvedDisputes.at(-1) ?? null;
  const raisedAt = lease.disputeRaisedAt ?? lastResolution?.raisedAt ?? null;
  const settlementDeadline = raisedAt ? raisedAt + SETTLEMENT_WINDOW_MS : null;
  const arbitrationDeadline = raisedAt ? raisedAt + SETTLEMENT_WINDOW_MS + ARBITRATION_WINDOW_MS : null;
  const now = Date.now();
  const settlementWindowOpen = raisedAt !== null && now <= raisedAt + SETTLEMENT_WINDOW_MS;
  const arbitrationWindowElapsed = raisedAt !== null && now > raisedAt + SETTLEMENT_WINDOW_MS + ARBITRATION_WINDOW_MS;
  const remainingFunds = lease.amountPerPeriod * (lease.totalPeriods - lease.periodsReleased);
  const ruling = lastResolution ? rulings.find((r) => r.resolvedAt === lastResolution.resolvedAt) ?? null : null;

  const issueRef = parseIssueReference(lease.disputeReason);
  const issueMessage = issueRef ? thread.find((m) => m.id === issueRef.messageId) ?? null : null;
  const tier0 = issueMessage?.maintenance ? checkTier0(issueMessage.maintenance, sourceListing?.condition ?? null) : null;
  const declaredArea =
    issueMessage?.maintenance?.area && sourceListing?.condition ? sourceListing.condition.areas[issueMessage.maintenance.area] : null;

  const timeline = buildEvidenceTimeline({
    condition: sourceListing?.condition ?? null,
    thread,
    disputeReason: lease.disputeReason,
    disputeRaisedAt: lease.disputeActive ? lease.disputeRaisedAt : lastResolution?.raisedAt ?? null,
    tenantEmail: lease.tenantEmail,
  });

  const handlePropose = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await proposeSettlement(lease.id, role, Math.round(proposedPct * 100), session.address);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await acceptSettlement(lease.id, role, session.address);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (landlordBps: number) => {
    setBusy(true);
    try {
      const text = reasoning.trim() || "No written reasoning was provided by the arbiter.";
      await resolveDispute(lease.id, landlordBps, session.address, text);
      setReasoning("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAutoResolve = async () => {
    setBusy(true);
    try {
      await autoResolveOverdueDispute(lease.id, session.address);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSendStatement = async () => {
    if (!statement.trim() || !role) return;
    setBusy(true);
    try {
      const otherEmail = role === "tenant" ? lease.landlordEmail : lease.tenantEmail;
      await sendTextMessage({
        leaseId: lease.id,
        fromEmail: session.email,
        toEmail: otherEmail,
        text: `Statement for the arbiter: ${statement.trim()}`,
      });
      setStatement("");
      setStatementSent(true);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const hasOpenProposal = lease.settlementProposedBps !== null && lease.settlementProposer !== null;
  const canAcceptProposal = hasOpenProposal && role !== null && role !== lease.settlementProposer;

  const outcome = lastResolution
    ? lastResolution.landlordBps === BPS_DENOMINATOR
      ? { label: "Released to landlord", tone: "gold" as const }
      : lastResolution.landlordBps === 0
        ? { label: "Refunded to tenant", tone: "forest" as const }
        : { label: `Split ${(lastResolution.landlordBps / 100).toFixed(0)}/${(100 - lastResolution.landlordBps / 100).toFixed(0)}`, tone: "neutral" as const }
    : null;

  return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <Link href={`/leases/${lease.id}`} className="text-sm text-forest-500 underline">
          ← Back to lease
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-3xl text-ink">Dispute</h1>
          {!lease.disputeActive && outcome && <Badge variant={outcome.tone}>{outcome.label}</Badge>}
        </div>
        <p className="mt-1 text-ink-muted">{lease.propertyAddress}</p>

        {/* 1. Status banner */}
        <div
          className={`mt-6 rounded-lg px-5 py-4 text-sm ${
            !lease.disputeActive
              ? outcome?.tone === "gold"
                ? "bg-gold-50 text-gold-700"
                : outcome?.tone === "forest"
                  ? "bg-forest-50 text-forest-700"
                  : "bg-cream-300 text-ink"
              : "bg-terracotta-50 text-terracotta-700"
          }`}
        >
          {!lease.disputeActive ? (
            <p className="font-semibold">Resolved — {outcome?.label}</p>
          ) : settlementWindowOpen ? (
            <>
              <p className="font-semibold">
                Settlement window — {Math.max(0, Math.ceil(((settlementDeadline ?? now) - now) / DAY_MS))} days remaining
              </p>
              <ProgressBar fraction={1 - ((settlementDeadline ?? now) - now) / SETTLEMENT_WINDOW_MS} tone="gold" />
            </>
          ) : !arbitrationWindowElapsed ? (
            <>
              <p className="font-semibold">
                In arbitration — ruling due {arbitrationDeadline && formatDate(new Date(arbitrationDeadline), "long")}
              </p>
              <ProgressBar
                fraction={1 - ((arbitrationDeadline ?? now) - now) / ARBITRATION_WINDOW_MS}
                tone="terracotta"
              />
            </>
          ) : (
            <p className="font-semibold">Ruling deadline passed — auto-resolution can be triggered by anyone</p>
          )}
        </div>

        {/* 2. Frozen tranche card */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-500">
                <FrostIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {lease.disputeActive ? "Next release frozen" : "Was frozen during this dispute"}
                </p>
                <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
                  <UsdcAmount amount={lease.disputeActive ? remainingFunds : lease.amountPerPeriod} /> · Period{" "}
                  {lease.periodsReleased + 1} of {lease.totalPeriods}
                </p>
                <Link href={`/leases/${lease.id}`} className="mt-1 inline-block text-xs text-forest-500 underline">
                  View lease
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Evidence timeline */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-ink">Evidence timeline</p>
            <p className="mt-1 text-xs text-ink-soft">
              Auto-assembled per Article 4.4 — both parties see this identical record.
            </p>
            <div className="mt-4">
              <EvidenceTimeline entries={timeline} />
            </div>
          </CardContent>
        </Card>

        {/* 4. Constitution panel */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <button
              onClick={() => setConstitutionOpen((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-ink"
            >
              Rules applied to this dispute
              <span className="text-xs text-ink-soft">{constitutionOpen ? "Hide" : "Show"}</span>
            </button>
            {constitutionOpen && (
              <div className="mt-4 space-y-2 text-sm">
                <ChecklistLine ok={!!issueMessage} label="Evidence attached to dispute" />
                <ChecklistLine ok={declaredArea?.status !== "known-issue"} label="Not a disclosed defect (Disclosure Shield, Art. 2.3)" />
                <ChecklistLine ok={declaredArea?.responsibility !== "tenant"} label="Landlord responsibility under the matrix (Art. 2.5)" />
                {tier0 && (
                  <p className={`mt-2 text-xs ${tier0.valid ? "text-forest-600" : "text-terracotta-600"}`}>
                    {tier0.valid
                      ? "→ Presumptively valid, proceeded directly to Tier 1 (Article 4.2)."
                      : tier0.reason}
                  </p>
                )}
                <Link href="/constitution" className="mt-2 inline-block text-xs text-forest-500 underline">
                  Read the full Constitution
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5. Action zone */}
        {lease.disputeActive && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-ink">Tier 1 — direct settlement</p>
              <blockquote className="mt-2 border-l-2 border-forest-200 pl-3 text-xs italic text-ink-soft">
                &ldquo;Either party may propose a split of the remaining escrow... A proposal accepted by
                the other party executes immediately and on-chain.&rdquo; — Article 4.3
              </blockquote>

              {hasOpenProposal ? (
                <div className="mt-4 rounded-lg bg-forest-50 p-4">
                  <p className="text-sm text-ink">
                    <span className="font-semibold capitalize">{lease.settlementProposer}</span> proposed: landlord
                    receives {formatUSDC(((lease.settlementProposedBps ?? 0) / BPS_DENOMINATOR) * remainingFunds)} USDC ·
                    tenant refunded{" "}
                    {formatUSDC((1 - (lease.settlementProposedBps ?? 0) / BPS_DENOMINATOR) * remainingFunds)} USDC.
                  </p>
                  {canAcceptProposal && settlementWindowOpen && (
                    <Button className="mt-3" onClick={handleAccept} disabled={busy}>
                      Accept this settlement
                    </Button>
                  )}
                  {!settlementWindowOpen && <p className="mt-2 text-xs text-ink-soft">The settlement window has closed.</p>}
                </div>
              ) : role && settlementWindowOpen ? (
                <div className="mt-4">
                  <label className="text-sm text-ink-muted">
                    Landlord share: <span className="font-semibold text-ink">{proposedPct}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={proposedPct}
                    onChange={(e) => setProposedPct(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <p className="mt-1.5 text-xs text-ink-soft">
                    Landlord receives {formatUSDC((proposedPct / 100) * remainingFunds)} USDC · Tenant refunded{" "}
                    {formatUSDC((1 - proposedPct / 100) * remainingFunds)} USDC
                  </p>
                  <Button className="mt-3" variant="secondary" onClick={handlePropose} disabled={busy}>
                    Propose this split
                  </Button>
                </div>
              ) : !settlementWindowOpen ? (
                <p className="mt-3 text-sm text-ink-soft">No settlement was reached — this dispute has moved to arbitration.</p>
              ) : (
                <p className="mt-3 text-sm text-ink-soft">Only the tenant or landlord on this lease can propose a settlement.</p>
              )}
            </CardContent>
          </Card>
        )}

        {lease.disputeActive && !settlementWindowOpen && !arbitrationWindowElapsed && role && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-ink">Submit a statement</p>
              <p className="mt-1 text-xs text-ink-soft">
                The panel is reviewing the evidence timeline above. Your statement is added to the shared record —
                both parties see it, no separate versions of reality.
              </p>
              {statementSent ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-forest-600">
                  <CheckIcon className="h-4 w-4" /> Statement sent.
                </p>
              ) : (
                <>
                  <textarea
                    className="mt-3 h-24 w-full resize-none rounded-md border border-forest-100 bg-cream-50 p-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                    placeholder="A closing statement for the arbiter…"
                    maxLength={500}
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                  />
                  <p className="mt-1 text-right text-xs text-ink-soft">{statement.length}/500</p>
                  <Button variant="secondary" onClick={handleSendStatement} disabled={busy || !statement.trim()}>
                    Send statement
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {lease.disputeActive && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-ink">Tier 2 — arbiter ratio resolution</p>
              <p className="mt-1 text-sm text-ink-muted">
                For this version, a single trusted arbiter resolves disputes that miss the settlement window.
                Production should replace this with a panel (multisig or DAO-governed resolver).
              </p>

              {settlementWindowOpen ? (
                <p className="mt-4 text-sm text-ink-soft">
                  Arbitration opens once the settlement window closes ({settlementDeadline && formatDate(new Date(settlementDeadline), "long")}).
                </p>
              ) : (
                <div className="mt-4">
                  <label className="text-sm text-ink-muted">
                    Landlord share: <span className="font-semibold text-ink">{arbiterPct}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={arbiterPct}
                    onChange={(e) => setArbiterPct(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <textarea
                    className="mt-3 h-20 w-full resize-none rounded-md border border-forest-100 bg-cream-50 p-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                    placeholder="Written reasoning for this ruling (Article 4.4)…"
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button variant="secondary" onClick={() => handleResolve(BPS_DENOMINATOR)} disabled={busy}>
                      Resolve for landlord — resume schedule
                    </Button>
                    <Button variant="destructive" onClick={() => handleResolve(0)} disabled={busy}>
                      Resolve for tenant — refund {formatUSDC(remainingFunds)} USDC
                    </Button>
                  </div>
                  <Button
                    className="mt-2"
                    variant="ghost"
                    onClick={() => handleResolve(Math.round(arbiterPct * 100))}
                    disabled={busy || arbiterPct === 0 || arbiterPct === 100}
                  >
                    Or rule a {arbiterPct}% / {100 - arbiterPct}% split
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {lease.disputeActive && arbitrationWindowElapsed && (
          <Card className="mt-6 border-terracotta-200">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-ink">Arbiter missed the ruling deadline</p>
              <p className="mt-1 text-sm text-ink-muted">
                Article 4.4: if arbitration isn&apos;t ruled within {ARBITRATION_WINDOW_MS / DAY_MS} days of the
                settlement window closing, anyone may trigger the auto-fallback — resolving in full to the landlord.
              </p>
              <Button className="mt-3" variant="secondary" onClick={handleAutoResolve} disabled={busy}>
                Trigger auto-resolution
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ruling card */}
        {!lease.disputeActive && lastResolution && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <ScaleIcon className="h-5 w-5 text-forest-500" />
                <p className="text-sm font-semibold text-ink">The ruling</p>
              </div>
              <Badge variant={outcome?.tone ?? "neutral"} className="mt-3">
                {outcome?.label}
              </Badge>
              <p className="mt-1 text-xs text-ink-soft capitalize">
                Resolved via {lastResolution.resolutionType.replace("-", " ")} on{" "}
                {formatDate(new Date(lastResolution.resolvedAt), "long")}
              </p>
              {ruling && (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">{ruling.reasoning}</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-ink-soft">sha256:{ruling.hash}</p>
                </>
              )}
              {txHash && (
                <a
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-forest-500 underline"
                >
                  View execution transaction on Arc
                </a>
              )}
              {lastResolution.landlordBps === BPS_DENOMINATOR && (
                <p className="mt-3 text-sm text-forest-600">Lease schedule resumed.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
  );
}

function ChecklistLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs ${ok ? "text-ink-muted" : "text-terracotta-600"}`}>
      <span className="mt-0.5">{ok ? "✓" : "✗"}</span>
      {label}
    </p>
  );
}
