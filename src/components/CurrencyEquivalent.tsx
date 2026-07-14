"use client";

import { useLocalCurrencyEquivalent, formatLocalCurrency } from "@/lib/fx";
import { useCurrencyPreference } from "@/lib/currency";

export function CurrencyEquivalent({
  usdcAmount,
  currencyCode,
  className,
}: {
  usdcAmount: number;
  /** Omit to use the user's stored currency preference (Settings → Currency display). */
  currencyCode?: string | null;
  className?: string;
}) {
  const preferred = useCurrencyPreference();
  const code = currencyCode ?? preferred;
  const equivalent = useLocalCurrencyEquivalent(usdcAmount, code);

  if (!code || equivalent === null) return null;

  return (
    <span className={className}>
      ≈ {formatLocalCurrency(equivalent, code)}
    </span>
  );
}
