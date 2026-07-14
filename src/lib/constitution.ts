"use client";

/**
 * The Constitution's binding time windows (Articles III & IV), as real
 * constants — not scattered magic numbers. Enforcement here is lazy /
 * on-view: windows are computed live whenever a relevant page loads,
 * the same pattern already used for the dashboard's signature-deadline
 * alerts. There's no background job in this project, so a window won't
 * visibly "flip" until someone opens a page after it lapses — acceptable
 * for a testnet-stage product, not silently pretended to be a live cron.
 */

export interface ConstitutionDoc {
  version: string;
  text: string;
  hash: string;
}

export async function fetchConstitution(): Promise<ConstitutionDoc | null> {
  const res = await fetch("/api/constitution");
  if (!res.ok) return null;
  return res.json();
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Article 3.2 */
export const ACKNOWLEDGMENT_WINDOW_MS = 48 * HOUR_MS;

/** Article 3.3 */
export const RESOLUTION_WINDOW_MS: Record<IssueSeverity, number> = {
  "urgent-safety": 72 * HOUR_MS,
  "affects-daily-living": 7 * DAY_MS,
  cosmetic: 21 * DAY_MS,
};

/** Article 4.3 */
export const SETTLEMENT_WINDOW_MS = 7 * DAY_MS;

/** Article 4.4 */
export const ARBITRATION_WINDOW_MS = 5 * DAY_MS;

/** Article 1.5 */
export const UNSIGNED_CANCEL_WINDOW_MS = 7 * DAY_MS;

/** Article 6.5 — window after lease completion for the landlord to file a caution fee claim before it auto-releases. */
export const CAUTION_CLAIM_WINDOW_MS = 7 * DAY_MS;

/** Article 2.4 */
export const CONCEALMENT_DISCOVERY_WINDOW_MS = 14 * DAY_MS;

export type IssueSeverity = "cosmetic" | "affects-daily-living" | "urgent-safety";

export const SEVERITY_OPTIONS: { value: IssueSeverity; label: string }[] = [
  { value: "cosmetic", label: "Cosmetic" },
  { value: "affects-daily-living", label: "Affects daily living" },
  { value: "urgent-safety", label: "Urgent / safety" },
];

export interface IssueTiming {
  reportedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  severity: IssueSeverity;
}

export function acknowledgmentDeadline(reportedAt: number): number {
  return reportedAt + ACKNOWLEDGMENT_WINDOW_MS;
}

export function resolutionDeadline(acknowledgedAt: number, severity: IssueSeverity): number {
  return acknowledgedAt + RESOLUTION_WINDOW_MS[severity];
}

export function isAcknowledgmentOverdue(issue: IssueTiming, now = Date.now()): boolean {
  return issue.acknowledgedAt === null && now > acknowledgmentDeadline(issue.reportedAt);
}

export function isResolutionOverdue(issue: IssueTiming, now = Date.now()): boolean {
  if (issue.acknowledgedAt === null || issue.resolvedAt !== null) return false;
  return now > resolutionDeadline(issue.acknowledgedAt, issue.severity);
}

/** Article 3.5 — the Escalation Rule (timing half only; disclosure/responsibility checked separately). */
export function isEscalatedOnTiming(issue: IssueTiming, now = Date.now()): boolean {
  return isAcknowledgmentOverdue(issue, now) || isResolutionOverdue(issue, now);
}
