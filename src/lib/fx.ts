"use client";

import { useEffect, useState } from "react";

const FX_ENDPOINT = "https://api.exchangerate-api.com/v4/latest/USD";
const CACHE_KEY = "rentpact:fx:USD";
const CACHE_TTL_MS = 15 * 60 * 1000;

interface FxCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

async function fetchRates(): Promise<Record<string, number> | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: FxCache = JSON.parse(cached);
      if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
        return parsed.rates;
      }
    }
  } catch {
    // ignore cache read errors, fall through to network fetch
  }

  try {
    const res = await fetch(FX_ENDPOINT);
    if (!res.ok) return null;
    const json = await res.json();
    const rates = json?.rates;
    if (!rates || typeof rates !== "object") return null;

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() } satisfies FxCache));
    } catch {
      // sessionStorage may be unavailable (private browsing) — non-fatal
    }

    return rates;
  } catch {
    return null;
  }
}

/**
 * Converts a USDC amount to a local-currency equivalent using a live FX rate.
 * Returns null (never a stale or fabricated number) if the fetch fails —
 * callers must hide the equivalent line entirely in that case.
 */
export function useLocalCurrencyEquivalent(usdcAmount: number, currencyCode: string | null) {
  const [equivalent, setEquivalent] = useState<number | null>(null);

  useEffect(() => {
    if (!currencyCode || currencyCode === "USD") {
      setEquivalent(null);
      return;
    }

    let cancelled = false;

    fetchRates().then((rates) => {
      if (cancelled) return;
      const rate = rates?.[currencyCode];
      setEquivalent(typeof rate === "number" ? usdcAmount * rate : null);
    });

    return () => {
      cancelled = true;
    };
  }, [usdcAmount, currencyCode]);

  return equivalent;
}

export function formatLocalCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currencyCode}`;
  }
}
