"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui";
import { useInstall, type Platform } from "@/lib/pwa";

const STEPS: Record<Platform, { heading: string; steps: string[] }> = {
  ios: {
    heading: "iPhone / iPad (Safari)",
    steps: [
      "Open RentPact in Safari (this only works in Safari, not Chrome).",
      "Tap the Share button — the square with an upward arrow.",
      "Scroll down and tap “Add to Home Screen”.",
      "Tap “Add”. The RentPact icon appears on your Home Screen — open it to run full-screen.",
    ],
  },
  android: {
    heading: "Android (Chrome)",
    steps: [
      "Tap “Install app” above — or open the ⋮ menu (top-right) and choose “Install app” / “Add to Home screen”.",
      "Confirm “Install”.",
      "RentPact is added to your home screen and app drawer — open it like any app.",
    ],
  },
  desktop: {
    heading: "Desktop (Chrome / Edge)",
    steps: [
      "Click “Install app” above — or click the install icon in the address bar (a monitor with a down arrow).",
      "Alternatively, open the ⋮ menu and choose “Install RentPact”.",
      "Confirm “Install”. RentPact opens in its own window.",
    ],
  },
};

const ORDER: Platform[] = ["ios", "android", "desktop"];

export default function InstallPage() {
  const { mounted, platform, standalone, canPrompt, promptInstall } = useInstall();
  const [result, setResult] = useState<"accepted" | "dismissed" | "unavailable" | null>(null);

  if (standalone) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="text-2xl">🎉</span>
          <p className="text-sm font-medium text-ink">You’re using the installed RentPact app.</p>
          <p className="max-w-sm text-xs text-ink-soft">
            Nothing to do here — you already have it. Push notifications can be turned on under Settings →
            Notifications.
          </p>
        </CardContent>
      </Card>
    );
  }

  const onInstall = async () => setResult(await promptInstall());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-ink-muted">
          Install RentPact on your phone or computer for a faster, full-screen experience — like a native app,
          with a home-screen icon and no app store needed.
        </p>
      </div>

      {mounted && canPrompt && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <p className="text-sm font-semibold text-ink">One-tap install</p>
              <p className="mt-0.5 text-xs text-ink-soft">Your browser supports installing RentPact directly.</p>
            </div>
            <button
              type="button"
              onClick={onInstall}
              className="rounded-full bg-forest-500 px-4 py-2 text-sm font-semibold text-cream-50 transition-colors hover:bg-forest-600"
            >
              Install app
            </button>
          </CardContent>
        </Card>
      )}

      {result === "accepted" && (
        <p className="text-sm text-forest-600">Installing… look for RentPact on your home screen.</p>
      )}
      {result === "dismissed" && (
        <p className="text-sm text-ink-soft">No problem — you can install any time from here.</p>
      )}

      {ORDER.map((p) => {
        const isYours = mounted && platform === p;
        const { heading, steps } = STEPS[p];
        return (
          <Card key={p} className={isYours ? "border-forest-300 ring-1 ring-forest-200" : undefined}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">{heading}</p>
                {isYours && (
                  <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-forest-600">
                    Your device
                  </span>
                )}
              </div>
              <ol className="mt-3 flex flex-col gap-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-muted">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-50 text-[11px] font-semibold text-forest-600">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-ink-soft">
        On iPhone, installing is also what unlocks push notifications — iOS only allows them for apps added to
        the Home Screen.
      </p>
    </div>
  );
}
