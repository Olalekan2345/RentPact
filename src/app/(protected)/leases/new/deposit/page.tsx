"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, CardContent, Badge } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { UsdcAmount } from "@/components/UsdcAmount";
import { getGatewayBalances, initiateCctpDeposit, MOCK_MODE, type ChainBalance } from "@/lib/circle";
import { createLease } from "@/lib/leaseData";
import { reserveListing, reactivateListing, linkLeaseToListing } from "@/lib/listings";
import { migrateListingThreadToLease } from "@/lib/messages";
import type { LeaseDraft } from "@/lib/leaseDraft";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { useCautionFeeLabel } from "@/lib/cautionFee";

type Step = "loading" | "select-source" | "bridging" | "depositing" | "success";

export default function DepositPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [draft, setDraft] = useState<LeaseDraft | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [balances, setBalances] = useState<ChainBalance[] | null>(null);
  const [selectedChain, setSelectedChain] = useState<string>("arc-testnet");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdLeaseId, setCreatedLeaseId] = useState<string | null>(null);
  const [acceptedConstitution, setAcceptedConstitution] = useState(false);
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    const raw = window.sessionStorage.getItem("rentpact:lease-draft");
    if (!raw) {
      router.push("/listings");
      return;
    }
    setDraft(JSON.parse(raw));
  }, [router]);

  useEffect(() => {
    if (!session) return;
    getGatewayBalances(session.address).then((b) => {
      setBalances(b);
      setStep("select-source");
    });
  }, [session]);

  const rentDue = draft ? draft.amountPerPeriod * draft.totalPeriods : 0;
  const cautionDue = draft?.cautionAmount ?? 0;
  const totalDue = rentDue + cautionDue;
  const selectedBalance = balances?.find((b) => b.chain === selectedChain)?.balance ?? 0;
  const needsBridge = selectedChain !== "arc-testnet";

  const handleDeposit = useCallback(async () => {
    if (!draft || !session) return;
    setError(null);

    if (!MOCK_MODE && !draft.landlordAddress) {
      setError("Your landlord hasn't set up their account yet.");
      router.push("/leases/new/waiting");
      return;
    }

    // Claimed up front, atomically, so a second tenant racing to fund the
    // same listing gets turned away here instead of both ending up with a
    // lease pending the landlord's signature for the same property.
    const listingId = window.sessionStorage.getItem("rentpact:listing-id");
    let reserved = false;
    if (listingId) {
      reserved = await reserveListing(listingId);
      if (!reserved) {
        setError("This property was just taken by another tenant. Please choose another listing.");
        return;
      }
    }

    try {
      if (needsBridge) {
        setStep("bridging");
        await initiateCctpDeposit({ address: session.address, sourceChain: selectedChain, amount: totalDue });
      }

      setStep("depositing");
      const { lease, hash } = await createLease({
        tenantEmail: session.email,
        tenantAddress: session.address,
        landlordEmail: draft.landlordEmail,
        landlordAddress: draft.landlordAddress ?? session.address,
        propertyAddress: draft.propertyAddress,
        propertyType: draft.propertyType,
        photoUrl: draft.photoUrl,
        amountPerPeriod: draft.amountPerPeriod,
        totalPeriods: draft.totalPeriods,
        frequency: draft.frequency,
        cautionAmount: draft.cautionAmount,
      });

      window.sessionStorage.removeItem("rentpact:lease-draft");
      if (listingId) {
        window.sessionStorage.removeItem("rentpact:listing-id");
        linkLeaseToListing(lease.id, listingId).catch(() => {});
        migrateListingThreadToLease(listingId, lease.id).catch(() => {});
      }
      setTxHash(hash);
      setCreatedLeaseId(lease.id);
      setStep("success");
    } catch (err) {
      console.error("Deposit failed:", err);
      setError(err instanceof Error ? err.message : "Deposit failed. Please try again.");
      setStep("select-source");
      if (reserved && listingId) reactivateListing(listingId).catch(() => {});
    }
  }, [draft, session, needsBridge, selectedChain, totalDue, router]);

  if (isLoading || !session || !draft) return null;

  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === draft.frequency)?.label ?? draft.frequency;

  return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Fund escrow</h1>
        <p className="mt-1 text-ink-muted">{draft.propertyAddress}</p>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between border-b border-forest-100 pb-3 text-sm">
              <span className="text-ink-soft">Rent</span>
              <span className="font-medium text-ink">
                <UsdcAmount amount={rentDue} iconSize={14} />
              </span>
            </div>
            {cautionDue > 0 && (
              <div className="flex items-center justify-between border-b border-forest-100 py-3 text-sm">
                <span className="text-ink-soft">{cautionLabel.term}</span>
                <span className="font-medium text-ink">
                  <UsdcAmount amount={cautionDue} iconSize={14} /> (refundable)
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-b border-forest-100 py-4">
              <span className="text-sm text-ink-soft">Total deposit today</span>
              <span className="text-xl font-semibold text-ink">
                <UsdcAmount amount={totalDue} iconSize={16} />
              </span>
            </div>
            <div className="flex items-center justify-between pt-4 text-sm text-ink-soft">
              <span>{frequencyLabel} · {draft.totalPeriods} periods</span>
              <Badge variant="forest">Gasless</Badge>
            </div>
          </CardContent>
        </Card>

        <blockquote className="mt-4 border-l-2 border-forest-200 pl-3 text-xs italic text-ink-soft">
          &ldquo;Escrowed funds are held by the smart contract alone. No person, company, or
          administrator — including RentPact — holds custody of escrowed funds.&rdquo;
          <br />— The RentPact Constitution, Article 1.2{" "}
          <Link href="/constitution" className="not-italic underline">
            Read in full
          </Link>
        </blockquote>

        <AnimatePresence mode="wait">
          {step === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
              <p className="text-sm text-ink-soft">Loading your unified balance…</p>
            </motion.div>
          )}

          {(step === "select-source" || step === "bridging" || step === "depositing") && balances && (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 flex flex-col gap-4"
            >
              <p className="text-sm font-medium text-ink-muted">Deposit from</p>
              <div className="flex flex-col gap-2">
                {balances.map((b) => (
                  <button
                    key={b.chain}
                    type="button"
                    disabled={step !== "select-source"}
                    onClick={() => setSelectedChain(b.chain)}
                    className={`flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                      selectedChain === b.chain
                        ? "border-forest-400 bg-forest-50"
                        : "border-forest-100 hover:border-forest-200"
                    }`}
                  >
                    <span>
                      <span className="block font-medium text-ink">{b.chainLabel}</span>
                      <span className="text-xs text-ink-soft">
                        {b.chain === "arc-testnet" ? "Native balance" : "Bridged via CCTP"}
                      </span>
                    </span>
                    <span className="font-semibold text-ink">
                      <UsdcAmount amount={b.balance} iconSize={13} />
                    </span>
                  </button>
                ))}
              </div>

              {needsBridge && selectedBalance < totalDue && (
                <p className="text-sm text-terracotta-500">
                  Insufficient balance on this chain to fully fund escrow — CCTP will bridge what&apos;s
                  requested regardless for this testnet demo.
                </p>
              )}

              {error && <p className="text-sm text-terracotta-500">{error}</p>}

              <label className="flex items-start gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={acceptedConstitution}
                  onChange={(e) => setAcceptedConstitution(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-forest-200"
                />
                I have read and accept the{" "}
                <Link href="/constitution" target="_blank" className="text-forest-500 underline">
                  RentPact Constitution
                </Link>
              </label>

              <Button
                size="lg"
                onClick={handleDeposit}
                disabled={step !== "select-source" || !acceptedConstitution}
              >
                {step === "bridging"
                  ? "Bridging via CCTP…"
                  : step === "depositing"
                    ? "Depositing…"
                    : needsBridge
                      ? "Bridge & deposit"
                      : "Deposit into escrow"}
              </Button>
            </motion.div>
          )}

          {step === "success" && txHash && createdLeaseId && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex flex-col items-center gap-4 rounded-lg border border-gold-200 bg-gold-50 px-6 py-10 text-center"
            >
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 14 }}
                className="animate-coin-drop flex h-16 w-16 items-center justify-center rounded-full bg-gold-400 shadow-gold"
              >
                <LogoMark size={34} />
              </motion.div>
              <h2 className="text-xl text-ink">Escrow funded</h2>
              <p className="flex items-center justify-center gap-1 text-sm text-ink-muted">
                <UsdcAmount amount={totalDue} /> is now held in escrow, awaiting the landlord&apos;s signature.
              </p>
              {cautionDue > 0 && (
                <p className="text-xs text-ink-soft">
                  Including a <UsdcAmount amount={cautionDue} iconSize={12} className="inline-flex" /> refundable{" "}
                  {cautionLabel.term.toLowerCase()}, held separately from rent.
                </p>
              )}
              <p className="max-w-full truncate font-mono text-xs text-ink-soft" title={txHash}>
                {txHash.slice(0, 10)}…{txHash.slice(-8)}
              </p>
              <Button onClick={() => router.push(`/leases/${createdLeaseId}`)}>View lease</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
  );
}
