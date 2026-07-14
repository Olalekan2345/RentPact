"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { formatUSDC } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import { sha256Hex } from "@/lib/condition";
import { hashClaim, useCautionFeeLabel, type ClaimItem } from "@/lib/cautionFee";

const EMPTY_ITEM: ClaimItem = { description: "", cost: 0, photoUrl: null, photoHash: null };

export function CautionClaimModal({
  open,
  onClose,
  onConfirm,
  cautionAmount,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (claimAmount: number, evidenceHash: `0x${string}`) => Promise<void>;
  cautionAmount: number;
}) {
  const [items, setItems] = useState<ClaimItem[]>([{ ...EMPTY_ITEM }]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    if (!open) {
      setItems([{ ...EMPTY_ITEM }]);
      setConfirming(false);
      setError(null);
    }
  }, [open]);

  const total = items.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0);
  const remainder = cautionAmount - total;
  const isBlanketClaim =
    items.length === 1 && (!items[0].description.trim() || items[0].description.trim().length < 8);
  const validItems = items.filter((i) => i.description.trim() && i.cost > 0);
  const canSubmit = validItems.length > 0 && total > 0 && total <= cautionAmount && !isBlanketClaim;

  const updateItem = (index: number, patch: Partial<ClaimItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handlePhoto = async (index: number, file: File | undefined) => {
    if (!file) return;
    const url = await resizeImageToDataUrl(file, 800);
    const hash = await sha256Hex(url);
    updateItem(index, { photoUrl: url, photoHash: hash });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const evidenceHash = `0x${await hashClaim(validItems)}` as `0x${string}`;
      await onConfirm(total, evidenceHash);
    } catch (err) {
      console.error("File deposit claim failed:", err);
      const message = err instanceof Error ? err.message : "Could not file the claim. Please try again.";
      setError(
        message.includes("155706")
          ? "Circle's secure signing panel didn't respond in time — usually a slow connection or an ad blocker. Please try again."
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/50 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="my-6 w-full max-w-lg rounded-t-2xl bg-cream-50 p-6 shadow-lifted sm:rounded-lg"
            initial={prefersReducedMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-500">
                !
              </span>
              <h2 className="text-xl text-ink">File a {cautionLabel.term.toLowerCase()} claim</h2>
            </div>

            <blockquote className="mt-3 border-l-2 border-terracotta-200 pl-3 text-xs italic text-ink-soft">
              &ldquo;A damage claim must itemize each damage with its estimated repair cost and photo
              evidence... Blanket claims are automatically rejected.&rdquo;
              <br />— The RentPact Constitution, Article 6.6{" "}
              <Link href="/constitution" className="not-italic underline">
                Read in full
              </Link>
            </blockquote>

            {!confirming ? (
              <>
                <div className="mt-4 flex flex-col gap-3">
                  {items.map((item, i) => (
                    <div key={i} className="rounded-md border border-forest-100 p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Damage description, e.g. Cracked bathroom tile"
                            value={item.description}
                            onChange={(e) => updateItem(i, { description: e.target.value })}
                            className="w-full rounded-md border border-forest-100 bg-cream-100 px-3 py-2 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-ink-soft">Est. repair cost (USDC)</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.cost || ""}
                              onChange={(e) => updateItem(i, { cost: Number(e.target.value) || 0 })}
                              className="h-8 w-28 rounded-md border border-forest-100 bg-cream-100 px-2 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                            />
                          </div>
                          <label className="mt-2 inline-block cursor-pointer text-xs font-medium text-forest-500 underline">
                            {item.photoUrl ? "Photo attached ✓" : "Attach comparison photo"}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={(e) => handlePhoto(i, e.currentTarget.files?.[0])}
                            />
                          </label>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-xs text-terracotta-500"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
                  >
                    + Add another item
                  </Button>
                </div>

                {isBlanketClaim && (
                  <p className="mt-3 text-sm text-terracotta-500">
                    A single vague line reads as a blanket claim — Article 6.6 auto-rejects those. Itemize
                    each piece of damage separately with its own cost and photo.
                  </p>
                )}
                {total > cautionAmount && (
                  <p className="mt-3 text-sm text-terracotta-500">
                    Claimed total ({formatUSDC(total)}) exceeds the {cautionLabel.term.toLowerCase()} (
                    {formatUSDC(cautionAmount)}).
                  </p>
                )}

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button variant="destructive" disabled={!canSubmit} onClick={() => setConfirming(true)}>
                    Continue
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-ink-muted">
                  The undisputed{" "}
                  <strong className="inline-flex items-center gap-1">
                    <UsdcAmount amount={Math.max(0, remainder)} />
                  </strong>{" "}
                  releases to the tenant immediately. Your claimed{" "}
                  <strong className="inline-flex items-center gap-1">
                    <UsdcAmount amount={total} />
                  </strong>{" "}
                  enters the dispute process. This is recorded on your profile.
                </p>
                {error && <p className="mt-3 text-sm text-terracotta-500">{error}</p>}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
                    Back
                  </Button>
                  <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "Filing claim…" : "File claim"}
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
