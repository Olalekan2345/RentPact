"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { fetchPrivacyPrefs, updatePrivacyPrefs, type PrivacyPrefs } from "@/lib/privacy";

const ROWS: { key: keyof PrivacyPrefs; label: string; helper: string }[] = [
  { key: "showReputation", label: "Reputation score", helper: "Your computed score and completed/dispute breakdown" },
  { key: "showRentalHistory", label: "Rental history", helper: "Property type and duration only — addresses always stay private" },
  { key: "showReviews", label: "Reviews received", helper: "Star ratings and comments from past counterparties" },
];

export default function PrivacySettingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<PrivacyPrefs | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchPrivacyPrefs(session.email).then(setPrefs);
  }, [session]);

  if (isLoading || !session) return null;

  const toggle = async (key: keyof PrivacyPrefs) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await updatePrivacyPrefs(session.email, { [key]: next[key] });
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        Controls what a prospective tenant or landlord sees on your{" "}
        <Link href={`/u/${encodeURIComponent(session.email)}`} className="text-forest-500 underline">
          public profile
        </Link>{" "}
        before entering a lease with you. Your wallet address, listings management, and messages are never
        shown there regardless of these settings.
      </p>

      <Card>
        <CardContent className="flex flex-col divide-y divide-forest-100 pt-6">
          {prefs === null ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink">{row.label}</p>
                  <p className="text-xs text-ink-soft">{row.helper}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs[row.key]}
                  onClick={() => toggle(row.key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    prefs[row.key] ? "bg-forest-500" : "bg-cream-400"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-cream-50 transition-transform ${
                      prefs[row.key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
