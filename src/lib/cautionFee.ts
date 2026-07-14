"use client";

import { useCurrencyPreference } from "@/lib/currency";
import { sha256Hex } from "@/lib/condition";

export interface ClaimItem {
  description: string;
  cost: number;
  photoUrl: string | null;
  photoHash: string | null;
}

/** Hashes the itemized claim the same way condition.ts hashes the baseline declaration — canonical JSON, SHA-256. Article 6.6. */
export async function hashClaim(items: ClaimItem[]): Promise<string> {
  const canonical = JSON.stringify(
    [...items]
      .map((i) => ({ description: i.description, cost: i.cost, photoHash: i.photoHash }))
      .sort((a, b) => a.description.localeCompare(b.description)),
  );
  return sha256Hex(canonical);
}

/**
 * Article 1.6 / 6.5-6.7 — the caution fee (security deposit), now held in the
 * same escrow contract as rent. Two names for the same field: Nigerian users
 * call it a "caution fee," everyone else knows "security deposit." This is
 * keyed off the currency display setting as a practical proxy — the app has
 * no working locale/geo system (see settings/language, which is English-only
 * and marked "coming soon" for everything else), so currency is the closest
 * real signal to a Nigerian user without inventing one.
 */
export function useCautionFeeLabel(): { term: string; tooltip: string } {
  const currency = useCurrencyPreference();
  if (currency === "NGN") {
    return { term: "Caution Fee", tooltip: "Also called a security deposit" };
  }
  return { term: "Security Deposit", tooltip: "In Nigeria: caution fee" };
}

/** Article 6.5's suggested-range guidance — a UX nudge, not a constitutional rule. */
export function suggestedCautionRange(annualRent: number): { min: number; max: number } {
  return { min: annualRent * 0.1, max: annualRent * 0.25 };
}

/** Above 50% of annual rent, the amount tends to deter tenants — a soft, non-blocking warning. */
export function isCautionFeeHigh(cautionAmount: number, annualRent: number): boolean {
  return annualRent > 0 && cautionAmount > annualRent * 0.5;
}
