"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui";

export interface DisputeIssueContext {
  messageId: string;
  category: string;
  description: string;
}

export function RaiseDisputeModal({
  open,
  onClose,
  onConfirm,
  issue,
  tier0Rejection,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  /** When set, the dispute must cite this filed Issue Report (Article 3.5) instead of free text. */
  issue?: DisputeIssueContext | null;
  /** When set, Tier 0 (Article 4.2) already rejected this — show why and block submission entirely. */
  tier0Rejection?: string | null;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) {
      setError(null);
      setConfirming(false);
      setNote("");
    }
  }, [open]);

  const composedReason = issue
    ? `Issue report [${issue.messageId}] (${issue.category}): ${issue.description}${note.trim() ? ` — ${note.trim()}` : ""}`
    : note.trim();

  const handleSubmit = async () => {
    if (!composedReason) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(composedReason);
      setNote("");
      setConfirming(false);
    } catch (err) {
      console.error("Raise dispute failed:", err);
      const message = err instanceof Error ? err.message : "Could not submit the dispute. Please try again.";
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-t-2xl bg-cream-50 p-6 shadow-lifted sm:rounded-lg"
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
              <h2 className="text-xl text-ink">Raise a dispute</h2>
            </div>

            <blockquote className="mt-3 border-l-2 border-terracotta-200 pl-3 text-xs italic text-ink-soft">
              &ldquo;Only the tenant may freeze a tranche... A dispute freezes all future releases
              until resolved. Already-released tranches are never reversible.&rdquo;
              <br />— The RentPact Constitution, Article 4.1{" "}
              <Link href="/constitution" className="not-italic underline">
                Read in full
              </Link>
            </blockquote>

            {tier0Rejection ? (
              <>
                <p className="mt-3 text-sm text-ink-muted">
                  This dispute can&apos;t be raised — Tier 0 automatic validity check (Article 4.2)
                  rejected it:
                </p>
                <p className="mt-2 rounded-md bg-terracotta-50 p-3 text-sm text-terracotta-600">{tier0Rejection}</p>
                <div className="mt-5 flex justify-end">
                  <Button variant="ghost" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </>
            ) : !confirming ? (
              <>
                <p className="mt-3 text-sm text-ink-muted">
                  This freezes the <strong>next scheduled release</strong> to the landlord until an
                  arbiter reviews the dispute. The rest of the schedule resumes automatically once
                  it&apos;s resolved.
                </p>

                {issue ? (
                  <div className="mt-4 rounded-md border border-forest-100 bg-cream-100 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Citing issue report · {issue.category}
                    </p>
                    <p className="mt-1 text-sm text-ink">{issue.description}</p>
                    <p className="mt-2 text-xs text-ink-soft">
                      Escalated under Article 3.5 — unacknowledged or unresolved past its window.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-terracotta-500">
                    Disputes must cite a filed Issue Report (Article 3.5). Report an issue in
                    Messages and let it escalate before raising a dispute.
                  </p>
                )}

                {issue && (
                  <>
                    <label className="mt-4 block text-sm font-medium text-ink-muted">
                      Anything to add? (optional)
                    </label>
                    <textarea
                      className="mt-1.5 h-20 w-full resize-none rounded-md border border-forest-100 bg-cream-50 p-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                      placeholder="Additional context for the arbiter…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </>
                )}

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button variant="destructive" disabled={!issue} onClick={() => setConfirming(true)}>
                    Continue
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-ink-muted">
                  Are you sure? Releases will stay frozen until the dispute is resolved. This
                  action is recorded on-chain and cannot be undone.
                </p>
                {error && <p className="mt-3 text-sm text-terracotta-500">{error}</p>}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
                    Back
                  </Button>
                  <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "Freezing release…" : "Freeze and raise dispute"}
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
