"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui";

const LANGUAGES = [
  { code: "en", label: "English", available: true },
  { code: "yo", label: "Yorùbá", available: false },
  { code: "ha", label: "Hausa", available: false },
  { code: "ig", label: "Igbo", available: false },
  { code: "fr", label: "Français", available: false },
] as const;

export default function LanguageSettingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  if (isLoading || !session) return null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        RentPact is English-only for now. These are the languages planned for the actual market this is built
        for — shown here so the roadmap is visible, not because they work yet.
      </p>

      <Card>
        <CardContent className="flex flex-col divide-y divide-forest-100 pt-6">
          {LANGUAGES.map((lang) => (
            <div key={lang.code} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className={`text-sm ${lang.available ? "font-medium text-ink" : "text-ink-soft"}`}>
                {lang.label}
              </span>
              {lang.available ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-forest-500 bg-forest-500">
                  <span className="h-2 w-2 rounded-full bg-cream-50" />
                </span>
              ) : (
                <span className="rounded-full bg-cream-400 px-2.5 py-1 text-[10px] font-medium text-ink-soft">
                  Coming soon
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
