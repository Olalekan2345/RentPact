import type { ReleaseFrequency } from "@/components/escrow";

/// Mirrors the Solidity `Frequency` enum ordering in RentPactEscrow.sol —
/// Monthly = 0, Quarterly = 1, Yearly = 2, Daily = 3, Hourly = 4. Daily/Hourly
/// were appended at the end deliberately, matching the contract enum, so
/// never reorder either side. Never assume monthly elsewhere.
export const FREQUENCY_TO_ONCHAIN: Record<ReleaseFrequency, number> = {
  monthly: 0,
  quarterly: 1,
  yearly: 2,
  daily: 3,
  hourly: 4,
};

export const ONCHAIN_TO_FREQUENCY: Record<number, ReleaseFrequency> = {
  0: "monthly",
  1: "quarterly",
  2: "yearly",
  3: "daily",
  4: "hourly",
};

/// Fractional for hourly — used for interval math (annual-rent estimates,
/// suggested caution range, etc.) that already tolerates non-integer days.
export const INTERVAL_DAYS: Record<ReleaseFrequency, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
  daily: 1,
  hourly: 1 / 24,
};

export const FREQUENCY_OPTIONS: { value: ReleaseFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "daily", label: "Daily" },
  { value: "hourly", label: "Hourly" },
];
