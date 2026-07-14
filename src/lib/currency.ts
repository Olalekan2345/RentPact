"use client";

import { useEffect, useState } from "react";

export const SUPPORTED_CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira" },
  { code: "KES", label: "Kenyan Shilling" },
  { code: "GHS", label: "Ghanaian Cedi" },
  { code: "USD", label: "US Dollar" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const STORAGE_KEY = "rentpact:currency";
const DEFAULT_CURRENCY: CurrencyCode = "NGN";
const CHANGE_EVENT = "rentpact:currency-change";

export function getStoredCurrency(): CurrencyCode {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (SUPPORTED_CURRENCIES.some((c) => c.code === stored) ? stored : DEFAULT_CURRENCY) as CurrencyCode;
}

export function setStoredCurrency(code: CurrencyCode) {
  window.localStorage.setItem(STORAGE_KEY, code);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Live-updates across the app when the preference changes, without a page reload. */
export function useCurrencyPreference(): CurrencyCode {
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);

  useEffect(() => {
    setCurrency(getStoredCurrency());
    const handler = () => setCurrency(getStoredCurrency());
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return currency;
}
