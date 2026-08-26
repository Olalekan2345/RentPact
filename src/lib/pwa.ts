"use client";

import { useEffect, useState } from "react";

/**
 * PWA install helpers. Chrome/Edge (Android + desktop) fire a
 * `beforeinstallprompt` we can defer and trigger on demand for a one-tap
 * install; iOS Safari has no such API, so there we show manual steps instead.
 * A module-level listener captures the event even if it fires before any
 * component mounts.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((s) => s());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** True when RentPact is already running as an installed app (so don't prompt). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

export interface InstallState {
  mounted: boolean;
  platform: Platform;
  standalone: boolean;
  canPrompt: boolean; // native one-tap install available
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export function useInstall(): InstallState {
  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [standalone, setStandalone] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
    setCanPrompt(deferred !== null);
    const update = () => {
      setCanPrompt(deferred !== null);
      setStandalone(isStandalone());
    };
    subscribers.add(update);
    return () => {
      subscribers.delete(update);
    };
  }, []);

  const promptInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    emit();
    return choice.outcome;
  };

  return { mounted, platform, standalone, canPrompt, promptInstall };
}
