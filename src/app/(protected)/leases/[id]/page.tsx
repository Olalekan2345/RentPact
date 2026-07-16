"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PropertyImage } from "@/components/PropertyImage";
import { EscrowTimeline } from "@/components/escrow";
import { RaiseDisputeModal, type DisputeIssueContext } from "@/components/RaiseDisputeModal";
import { CautionClaimModal } from "@/components/CautionClaimModal";
import { MoveOutComparison } from "@/components/MoveOutComparison";
import { useCautionFeeLabel } from "@/lib/cautionFee";
import { CAUTION_CLAIM_WINDOW_MS, DAY_MS, isEscalatedOnTiming } from "@/lib/constitution";
import { fetchThread, type Message } from "@/lib/messages";
import { checkTier0 } from "@/lib/tier0";
import { CurrencyEquivalent } from "@/components/CurrencyEquivalent";
import { ConditionDeclarationView } from "@/components/ConditionDeclarationView";
import { Badge, Button, Card, CardContent, CountUp, Skeleton } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { UsdcAmount } from "@/components/UsdcAmount";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { nodesForLease } from "@/lib/leaseTimeline";
import { fetchReviewsFor, submitReview } from "@/lib/reviews";
import { fetchListingIdForLease, fetchListing, type Listing } from "@/lib/listings";
import { FREQUENCY_OPTIONS, INTERVAL_DAYS } from "@/lib/contracts/frequency";
import { MOCK_MODE } from "@/lib/circle";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/chain";
import { resizeImageToDataUrl, uploadDataUrl } from "@/lib/image";
import { sha256Hex } from "@/lib/condition";
import {
  fetchMoveOutCondition,
  submitMoveOutCondition,
  type MoveOutCondition,
  type MoveOutPhoto,
} from "@/lib/moveOut";
import {
  getLease,
  leaseStatus,
  nextReleaseDate,
  pendingPeriods,
  raiseDispute,
  releaseTranche,
  signDeadline,
  getLeaseActivity,
  escrowContractAddress,
  fileDepositClaim,
  releaseCaution,
  type Lease,
  type ActivityItem,
} from "@/lib/leaseData";

const ACTIVITY_LABEL: Record<ActivityItem["type"], string> = {
  deposit: "Escrow deposit (lease created)",
  signed: "Lease signed",
  release: "Tranche released",
  "dispute-raised": "Dispute raised",
  "dispute-resolved": "Dispute resolved",
  cancelled: "Lease cancelled",
  "caution-claim-filed": "Caution fee claim filed",
  "caution-released": "Caution fee returned",
  "caution-claim-resolved": "Caution fee claim resolved",
};

export default function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [lease, setLease] = useState<Lease | null | undefined>(undefined);
  const [sourceListing, setSourceListing] = useState<Listing | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[] | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState<boolean | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [onChainActivity, setOnChainActivity] = useState<ActivityItem[] | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [moveOut, setMoveOut] = useState<MoveOutCondition | null | undefined>(undefined);
  const [moveOutNotes, setMoveOutNotes] = useState("");
  const [moveOutRoom, setMoveOutRoom] = useState("");
  const [moveOutPhotos, setMoveOutPhotos] = useState<MoveOutPhoto[]>([]);
  const [uploadingMoveOutPhoto, setUploadingMoveOutPhoto] = useState(false);
  const [submittingMoveOut, setSubmittingMoveOut] = useState(false);
  const [moveOutError, setMoveOutError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [cautionBusy, setCautionBusy] = useState(false);
  const [cautionError, setCautionError] = useState<string | null>(null);
  const cautionLabel = useCautionFeeLabel();

  const refresh = useCallback(() => {
    getLease(id, false).then(setLease);
  }, [id]);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session || !lease) return;
    const counterpartyEmail = lease.tenantEmail === session.email ? lease.landlordEmail : lease.tenantEmail;
    fetchReviewsFor(counterpartyEmail).then((reviews) => {
      setAlreadyReviewed(reviews.some((r) => r.leaseId === lease.id && r.fromEmail === session.email));
    });
  }, [session, lease]);

  useEffect(() => {
    if (!lease) return;
    fetchListingIdForLease(lease.id).then((listingId) => {
      if (!listingId) return;
      fetchListing(listingId).then(setSourceListing);
    });
  }, [lease]);

  useEffect(() => {
    if (!lease) return;
    fetchMoveOutCondition(lease.id).then(setMoveOut);
    fetchThread(lease.id).then(setThreadMessages);
  }, [lease]);

  // The on-chain proof panel scans every event ever emitted for this lease —
  // slow over a public RPC, and most visits never look at it. Only fetch
  // once the viewer actually opens the panel.
  useEffect(() => {
    if (!lease || !showProof) return;
    getLeaseActivity(lease.id).then(setOnChainActivity);
  }, [lease, showProof]);

  useEffect(() => {
    const fromQuery = searchParams.get("raiseDisputeFor");
    if (fromQuery) setSelectedIssueId(fromQuery);
  }, [searchParams]);

  const escalatedIssues = useMemo(() => {
    if (!threadMessages || !session) return [];
    return threadMessages.filter(
      (m) =>
        m.type === "maintenance" &&
        m.maintenance &&
        m.fromEmail === session.email &&
        m.maintenance.status !== "resolved" &&
        isEscalatedOnTiming({
          reportedAt: m.createdAt,
          acknowledgedAt: m.maintenance.acknowledgedAt,
          resolvedAt: m.maintenance.resolvedAt,
          severity: m.maintenance.severity,
        }),
    );
  }, [threadMessages, session]);

  useEffect(() => {
    if (!selectedIssueId && escalatedIssues.length > 0) {
      setSelectedIssueId(escalatedIssues[0].id);
    }
  }, [selectedIssueId, escalatedIssues]);

  if (isLoading || !session || lease === undefined) {
    return (
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
          <Skeleton className="h-40 w-full" />
          <div className="mt-6">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
    );
  }

  if (lease === null) {
    return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl text-ink">Lease not found</h1>
          <p className="mt-2 text-ink-muted">This lease may have been created on a different device.</p>
          <Link href="/dashboard" className="mt-6 inline-block">
            <Button>Back to dashboard</Button>
          </Link>
        </div>
    );
  }

  const viewerRole: "tenant" | "landlord" | "guest" =
    lease.tenantEmail === session.email ? "tenant" : lease.landlordEmail === session.email ? "landlord" : "guest";

  const selectedIssue = escalatedIssues.find((m) => m.id === selectedIssueId) ?? null;
  const disputeIssueContext: DisputeIssueContext | null =
    selectedIssue && selectedIssue.maintenance
      ? { messageId: selectedIssue.id, category: selectedIssue.maintenance.category, description: selectedIssue.maintenance.description }
      : null;
  const tier0 = selectedIssue?.maintenance ? checkTier0(selectedIssue.maintenance, sourceListing?.condition ?? null) : null;

  const status = leaseStatus(lease);
  const due = pendingPeriods(lease);
  const next = nextReleaseDate(lease);
  const totalInEscrow = lease.amountPerPeriod * (lease.totalPeriods - lease.periodsReleased);
  const cumulativeReceived = lease.amountPerPeriod * lease.periodsReleased;
  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === lease.frequency)?.label ?? lease.frequency;
  const endDate = lease.signedAt
    ? new Date(lease.signedAt + lease.totalPeriods * INTERVAL_DAYS[lease.frequency] * 86_400_000)
    : null;

  const handleRelease = async () => {
    setReleasing(true);
    setReleaseError(null);
    try {
      await releaseTranche(lease.id, session.address);
      refresh();
    } catch (err) {
      console.error("Release tranche failed:", err);
      const message = err instanceof Error ? err.message : "Could not release this tranche. Please try again.";
      setReleaseError(
        message.includes("155706")
          ? "Circle's secure signing panel didn't respond in time — usually a slow connection or an ad blocker. Please try again."
          : message,
      );
    } finally {
      setReleasing(false);
    }
  };

  const handleDispute = async (reason: string) => {
    await raiseDispute(lease.id, reason, session.address);
    setDisputeModalOpen(false);
    refresh();
  };

  const handleSubmitReview = async () => {
    setReviewError(null);
    setSubmittingReview(true);
    try {
      const toEmail = lease.tenantEmail === session.email ? lease.landlordEmail : lease.tenantEmail;
      await submitReview({ leaseId: lease.id, fromEmail: session.email, toEmail, rating: reviewRating, comment: reviewComment });
      setAlreadyReviewed(true);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleMoveOutPhotoAdd = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file || !moveOutRoom.trim()) return;

    setMoveOutError(null);
    if (file.size > 5 * 1024 * 1024) {
      setMoveOutError("Image must be under 5MB.");
      return;
    }

    setUploadingMoveOutPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 800);
      const hash = await sha256Hex(dataUrl);
      const url = await uploadDataUrl(dataUrl, "move-out");
      setMoveOutPhotos((prev) => [...prev, { room: moveOutRoom.trim(), url, hash }]);
      setMoveOutRoom("");
    } catch {
      setMoveOutError("Could not upload that image. Try a different file.");
    } finally {
      setUploadingMoveOutPhoto(false);
    }
  };

  const handleSubmitMoveOut = async () => {
    if (moveOutPhotos.length === 0) {
      setMoveOutError("Add at least one room photo.");
      return;
    }
    setSubmittingMoveOut(true);
    setMoveOutError(null);
    try {
      const record = await submitMoveOutCondition({
        leaseId: lease.id,
        submittedBy: session.email,
        notes: moveOutNotes.trim(),
        photos: moveOutPhotos,
      });
      setMoveOut(record);
    } catch (err) {
      setMoveOutError(err instanceof Error ? err.message : "Could not submit move-out condition.");
    } finally {
      setSubmittingMoveOut(false);
    }
  };

  const handleFileClaim = async (claimAmount: number, evidenceHash: `0x${string}`) => {
    await fileDepositClaim(lease.id, claimAmount, evidenceHash, session.address);
    setClaimModalOpen(false);
    refresh();
  };

  const handleReleaseCaution = async () => {
    setCautionBusy(true);
    setCautionError(null);
    try {
      await releaseCaution(lease.id, session.address);
      refresh();
    } catch (err) {
      setCautionError(err instanceof Error ? err.message : "Could not release the caution fee.");
    } finally {
      setCautionBusy(false);
    }
  };

  return (
    <>
      {/* Property header strip */}
      <div className="relative">
        <PropertyImage
          seed={lease.id}
          propertyType={lease.propertyType}
          overrideUrl={lease.photoUrl}
          alt={lease.propertyAddress}
          className="h-48 w-full sm:h-64"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/20 to-transparent" />
      </div>

      <div className="mx-auto -mt-6 max-w-3xl px-4 pb-16 sm:px-8">
        <Card className="shadow-lifted">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-serif text-2xl text-ink">{lease.propertyAddress}</h1>
                <p className="mt-1 text-sm text-ink-soft capitalize">{lease.propertyType}</p>
              </div>
              <StatusBadge status={status} />
            </div>

            {status === "awaiting-signature" && (
              <div className="mt-4 rounded-md bg-cream-400 p-4 text-sm text-ink-muted">
                Waiting for {lease.landlordEmail} to sign. If unsigned by{" "}
                {formatDate(signDeadline(lease), "long")}, funds can be reclaimed in full.
                {viewerRole === "landlord" && (
                  <Link href={`/leases/${lease.id}/invite`} className="ml-2 font-semibold text-forest-500 underline">
                    Review and sign →
                  </Link>
                )}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-4 border-y border-forest-100 py-5 sm:grid-cols-3">
              <Stat
                label="Total in escrow"
                value={
                  <span className="inline-flex items-center gap-1">
                    <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
                    <CountUp value={totalInEscrow} />
                  </span>
                }
              />
              {viewerRole === "landlord" ? (
                <Stat
                  label="Cumulative received"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
                      <CountUp value={cumulativeReceived} />
                    </span>
                  }
                />
              ) : (
                <Stat
                  label="Next release"
                  value={
                    next
                      ? lease.frequency === "daily" || lease.frequency === "hourly"
                        ? formatDateTime(next)
                        : formatDate(next)
                      : "—"
                  }
                />
              )}
              <Stat label="Progress" value={`${lease.periodsReleased} / ${lease.totalPeriods} periods`} />
            </div>
            <CurrencyEquivalent usdcAmount={totalInEscrow} className="mt-1 block text-xs text-ink-soft" />

            <div className="mt-6 flex flex-wrap gap-3">
              {due > 0 && !lease.disputeActive && (
                <Button onClick={handleRelease} disabled={releasing}>
                  {releasing ? "Releasing…" : `Release ${due} due period${due > 1 ? "s" : ""}`}
                </Button>
              )}
              {viewerRole === "tenant" && status === "active" && escalatedIssues.length > 0 && (
                <Button variant="destructive" onClick={() => setDisputeModalOpen(true)}>
                  Raise dispute
                </Button>
              )}
              {lease.disputeActive && (
                <Link href={`/leases/${lease.id}/dispute`}>
                  <Button variant="secondary">View dispute</Button>
                </Link>
              )}
            </div>

            {viewerRole === "tenant" && status === "active" && escalatedIssues.length === 0 && (
              <p className="mt-3 text-sm text-ink-soft">
                Disputes must cite a filed Issue Report under Article 3.5 — report an issue in{" "}
                <Link href={`/messages/${lease.id}`} className="text-forest-500 underline">
                  Messages
                </Link>{" "}
                and let it go unacknowledged past 48h or unresolved past its window before you can
                raise a dispute.
              </p>
            )}

            {releaseError && <p className="mt-3 text-sm text-terracotta-500">{releaseError}</p>}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="mb-5 text-lg font-semibold text-ink">Escrow timeline</h2>
            <EscrowTimeline frequency={lease.frequency} nodes={nodesForLease(lease)} />
          </CardContent>
        </Card>

        {lease.cautionAmount > 0 && (
          <CautionFeeCard
            lease={lease}
            viewerRole={viewerRole}
            label={cautionLabel.term}
            busy={cautionBusy}
            error={cautionError}
            onFileClaim={() => setClaimModalOpen(true)}
            onRelease={handleReleaseCaution}
          />
        )}

        {/* Full terms */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-ink">Lease terms</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <TermRow label="Rent per period" value={<UsdcAmount amount={lease.amountPerPeriod} />} />
              <TermRow label="Frequency" value={frequencyLabel} />
              <TermRow label="Duration" value={`${lease.totalPeriods} periods`} />
              {lease.cautionAmount > 0 && (
                <TermRow
                  label={cautionLabel.term}
                  value={
                    <span className="inline-flex items-center gap-1">
                      <UsdcAmount amount={lease.cautionAmount} /> (refundable)
                    </span>
                  }
                />
              )}
              <TermRow label="Start date" value={lease.signedAt ? formatDate(new Date(lease.signedAt)) : "Not yet started"} />
              <TermRow label="End date" value={endDate ? formatDate(endDate) : "—"} />
              <TermRow label="Property type" value={lease.propertyType} className="capitalize" />
            </dl>
          </CardContent>
        </Card>

        {/* Both parties */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-ink">Parties</h2>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-md border border-forest-100 p-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{lease.tenantEmail}</p>
                  <p className="text-xs text-ink-soft">Tenant</p>
                </div>
                <span className="text-xs text-ink-soft">Deposited {formatDate(new Date(lease.createdAt))}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-forest-100 p-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{lease.landlordEmail}</p>
                  <p className="text-xs text-ink-soft">Landlord</p>
                </div>
                <span className="text-xs text-ink-soft">
                  {lease.signedAt ? `Signed ${formatDate(new Date(lease.signedAt))}` : "Awaiting signature"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* On-chain proof */}
        {!MOCK_MODE && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-ink">On-chain proof</h2>
              <p className="mt-1 text-xs text-ink-soft">
                Contract:{" "}
                {escrowContractAddress ? (
                  <a
                    href={explorerAddressUrl(escrowContractAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-forest-500 underline"
                  >
                    {escrowContractAddress}
                  </a>
                ) : (
                  "not configured"
                )}
              </p>

              <div className="mt-4 flex flex-col gap-2">
                {!showProof ? (
                  <button
                    type="button"
                    onClick={() => setShowProof(true)}
                    className="w-fit text-sm font-medium text-forest-500 underline"
                  >
                    View transaction history →
                  </button>
                ) : onChainActivity === null ? (
                  <Skeleton className="h-16 w-full" />
                ) : onChainActivity.length === 0 ? (
                  <p className="text-sm text-ink-soft">No confirmed transactions yet.</p>
                ) : (
                  onChainActivity.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-forest-100 p-3 text-sm">
                      <div>
                        <p className="font-medium text-ink">{ACTIVITY_LABEL[item.type]}</p>
                        <p className="flex items-center gap-1 text-xs text-ink-soft">
                          {formatDate(new Date(item.timestamp), "long")}
                          {item.amount !== null && (
                            <>
                              {" · "}
                              <UsdcAmount amount={item.amount} iconSize={11} />
                            </>
                          )}
                        </p>
                      </div>
                      {item.txHash && (
                        <a
                          href={explorerTxUrl(item.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 font-mono text-xs text-forest-500 underline"
                        >
                          {item.txHash.slice(0, 6)}…{item.txHash.slice(-4)}
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {sourceListing?.condition && (
          <div className="mt-6">
            <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Move-in condition</p>
            <ConditionDeclarationView condition={sourceListing.condition} />
          </div>
        )}

        {/* Section 4c — baseline vs move-out comparison, the evidence a damage claim compares against */}
        {sourceListing?.condition && moveOut && (
          <MoveOutComparison baselinePhotos={sourceListing.condition.photos} moveOutPhotos={moveOut.photos} />
        )}

        {/* Move-out condition */}
        {viewerRole !== "guest" && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Move-out condition</p>
              <h2 className="text-lg font-semibold text-ink">
                {moveOut ? "Filed" : status === "completed" ? "File move-out condition" : "Available once the lease completes"}
              </h2>

              {moveOut ? (
                <div className="mt-4">
                  <p className="text-xs text-ink-soft">
                    Filed by {moveOut.submittedBy} · {formatDate(new Date(moveOut.declaredAt), "long")}
                  </p>
                  {moveOut.notes && <p className="mt-2 text-sm text-ink-muted">{moveOut.notes}</p>}
                  {moveOut.photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {moveOut.photos.map((photo, i) => (
                        <div key={i} className="overflow-hidden rounded-md border border-forest-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt={photo.room} className="h-20 w-full object-cover" />
                          <p className="truncate bg-cream-400 px-1.5 py-1 text-[11px] text-ink-muted">{photo.room}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 truncate font-mono text-[11px] text-ink-soft" title={moveOut.hash}>
                    Hash: {moveOut.hash.slice(0, 16)}…{moveOut.hash.slice(-8)}
                  </p>
                </div>
              ) : status === "completed" ? (
                <div className="mt-4 flex flex-col gap-3">
                  <p className="text-sm text-ink-muted">
                    Photograph the property&apos;s condition at move-out — compared against the move-in
                    declaration above, this is real evidence for any deposit dispute.
                  </p>
                  <textarea
                    placeholder="Notes on condition, damage, or wear (optional)"
                    value={moveOutNotes}
                    onChange={(e) => setMoveOutNotes(e.target.value)}
                    rows={3}
                    className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Room name, e.g. Kitchen"
                      value={moveOutRoom}
                      onChange={(e) => setMoveOutRoom(e.target.value)}
                      className="h-10 flex-1 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                    />
                    <label
                      className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-medium ${
                        moveOutRoom.trim() ? "border-forest-400 text-forest-500" : "border-forest-100 text-ink-soft"
                      }`}
                    >
                      {uploadingMoveOutPhoto ? "Uploading…" : "Add photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={!moveOutRoom.trim() || uploadingMoveOutPhoto}
                        onChange={handleMoveOutPhotoAdd}
                      />
                    </label>
                  </div>
                  {moveOutPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {moveOutPhotos.map((photo, i) => (
                        <div key={i} className="overflow-hidden rounded-md border border-forest-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt={photo.room} className="h-20 w-full object-cover" />
                          <p className="truncate bg-cream-400 px-1.5 py-1 text-[11px] text-ink-muted">{photo.room}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {moveOutError && <p className="text-sm text-terracotta-500">{moveOutError}</p>}
                  <Button size="sm" onClick={handleSubmitMoveOut} disabled={submittingMoveOut} className="self-start">
                    {submittingMoveOut ? "Filing…" : "File move-out condition"}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">
                  This unlocks once the lease is fully completed, same as reviews.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {status === "completed" && viewerRole !== "guest" && alreadyReviewed !== null && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-ink">
                {alreadyReviewed ? "Review submitted" : `Review your ${viewerRole === "tenant" ? "landlord" : "tenant"}`}
              </h2>
              {alreadyReviewed ? (
                <p className="mt-2 text-sm text-ink-muted">Thanks — your review is visible on their profile.</p>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setReviewRating(n)}
                        className={`text-2xl leading-none ${n <= reviewRating ? "text-gold-600" : "text-forest-100"}`}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="How was the experience? (optional)"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={3}
                    className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                  />
                  {reviewError && <p className="text-sm text-terracotta-500">{reviewError}</p>}
                  <Button onClick={handleSubmitReview} disabled={submittingReview} className="self-start">
                    {submittingReview ? "Submitting…" : "Submit review"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <RaiseDisputeModal
        open={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        onConfirm={handleDispute}
        issue={disputeIssueContext}
        tier0Rejection={tier0 && !tier0.valid ? tier0.reason : null}
      />
      <CautionClaimModal
        open={claimModalOpen}
        onClose={() => setClaimModalOpen(false)}
        onConfirm={handleFileClaim}
        cautionAmount={lease.cautionAmount}
      />
    </>
  );
}

/** Section 4a — Article 6.5-6.7's caution fee lifecycle, surfaced after lease completion. */
function CautionFeeCard({
  lease,
  viewerRole,
  label,
  busy,
  error,
  onFileClaim,
  onRelease,
}: {
  lease: Lease;
  viewerRole: "tenant" | "landlord" | "guest";
  label: string;
  busy: boolean;
  error: string | null;
  onFileClaim: () => void;
  onRelease: () => void;
}) {
  const now = Date.now();

  if (lease.cautionSettled) {
    return (
      <Card className="mt-6 border-forest-200">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink">{label}</h2>
          <p className="mt-2 flex items-center gap-1 text-sm text-forest-600">
            {label} returned <UsdcAmount amount={lease.cautionAmount} /> ✓
          </p>
        </CardContent>
      </Card>
    );
  }

  if (lease.cautionClaimFiledAt !== null) {
    const remainder = lease.cautionAmount - (lease.cautionClaimedAmount ?? 0);
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink">{label}</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Landlord claimed <UsdcAmount amount={lease.cautionClaimedAmount ?? 0} className="inline-flex" /> ·{" "}
            {remainder > 0 && (
              <>
                <UsdcAmount amount={remainder} className="inline-flex" /> released to you now ·{" "}
              </>
            )}
            claim in dispute
          </p>
          <Link href={`/leases/${lease.id}/dispute`} className="mt-2 inline-block text-sm text-forest-500 underline">
            View dispute →
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (lease.completedAt === null) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-ink">{label}</h2>
          <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted">
            <UsdcAmount amount={lease.cautionAmount} /> held in escrow, separate from rent tranches. Returns
            automatically 7 days after the lease completes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const deadline = lease.completedAt + CAUTION_CLAIM_WINDOW_MS;
  const windowOpen = now <= deadline;
  const daysLeft = Math.max(0, Math.ceil((deadline - now) / DAY_MS));

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-ink">{label}</h2>
        {windowOpen ? (
          <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted">
            Returns automatically on {formatDate(new Date(deadline), "long")} ({daysLeft} day{daysLeft === 1 ? "" : "s"}) ·{" "}
            <UsdcAmount amount={lease.cautionAmount} className="inline-flex" />
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted">
            The 7-day claim window has closed with no claim filed — anyone can trigger the return of{" "}
            <UsdcAmount amount={lease.cautionAmount} className="inline-flex" /> now.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {viewerRole === "landlord" && windowOpen && (
            <Button variant="secondary" onClick={onFileClaim}>
              File a damage claim
            </Button>
          )}
          {!windowOpen && (
            <Button onClick={onRelease} disabled={busy}>
              {busy ? "Releasing…" : `Release ${label.toLowerCase()}`}
            </Button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-terracotta-500">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}

function TermRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className={`mt-1 font-medium text-ink ${className ?? ""}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof leaseStatus> }) {
  const map = {
    "awaiting-signature": { label: "Awaiting signature", variant: "neutral" as const },
    active: { label: "Active", variant: "forest" as const },
    disputed: { label: "Disputed", variant: "terracotta" as const },
    completed: { label: "Completed", variant: "gold" as const },
    cancelled: { label: "Cancelled", variant: "neutral" as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
