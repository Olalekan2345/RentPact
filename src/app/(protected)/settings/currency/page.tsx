"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui";
import { SUPPORTED_CURRENCIES, getStoredCurrency, setStoredCurrency, type CurrencyCode } from "@/lib/currency";

export default function CurrencySettingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [currency, setCurrency] = useState<CurrencyCode | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    setCurrency(getStoredCurrency());
  }, []);

  if (isLoading || !session) return null;

  const handleSelect = (code: CurrencyCode) => {
    setCurrency(code);
    setStoredCurrency(code);
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        Amounts stay in USDC everywhere — this only controls the local-currency equivalent shown alongside
        them, using live exchange rates.
      </p>

      <Card>
        <CardContent className="flex flex-col divide-y divide-forest-100 pt-6">
          {SUPPORTED_CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => handleSelect(c.code)}
              className="flex items-center justify-between py-3 text-left first:pt-0 last:pb-0"
            >
              <span>
                <span className="block text-sm font-medium text-ink">{c.code}</span>
                <span className="block text-xs text-ink-soft">{c.label}</span>
              </span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                  currency === c.code ? "border-forest-500 bg-forest-500" : "border-forest-100"
                }`}
              >
                {currency === c.code && <span className="h-2 w-2 rounded-full bg-cream-50" />}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
