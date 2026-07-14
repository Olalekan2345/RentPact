"use client";

/**
 * Article 4.2 — the Constitution's Tier 0 Automatic Validity Rules. Enforced
 * here at the app layer: the UI blocks submission of a dispute that fails
 * these checks before ever calling raiseDispute. This is NOT enforced by
 * the smart contract — the contract has no access to condition-declaration
 * data (disclosure status, the maintenance matrix), so a technically
 * capable user could still call raiseDispute directly and bypass this.
 * That gap is disclosed in the Constitution itself (Article VIII.4).
 */

import type { ConditionDeclaration } from "@/lib/condition";
import type { MaintenanceDetails } from "@/lib/messages";

export interface Tier0Result {
  valid: boolean;
  reason: string | null;
}

export function checkTier0(issue: MaintenanceDetails, condition: ConditionDeclaration | null): Tier0Result {
  if (!issue.area || !condition) {
    return { valid: true, reason: null };
  }

  const declared = condition.areas[issue.area];
  if (!declared) return { valid: true, reason: null };

  if (declared.status === "known-issue") {
    return {
      valid: false,
      reason:
        "This area was disclosed as a known issue in the Property Condition Declaration before you signed — the Disclosure Shield (Article 2.3) means it can't be the basis of a dispute.",
    };
  }

  if (declared.responsibility === "tenant") {
    return {
      valid: false,
      reason:
        "This area is marked as a tenant responsibility under the Maintenance Responsibility Matrix (Article 2.5) — disputes can't be raised over tenant-responsibility items.",
    };
  }

  return { valid: true, reason: null };
}
