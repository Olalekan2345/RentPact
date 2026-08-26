"use client";

import { useEffect, useState } from "react";

/**
 * PWA install helpers. Chrome/Edge (Android + desktop) fire a
 * `beforeinstallprompt` we can defer and trigger on demand for a one-tap
 * install; iOS Safari has no such API, so there we show manual steps instead.
 * A module-level listener captures the event even if it fires before any
 * component mounts.
 *
 * Detecting "already installed" is only reliable from inside the running app
 * (display-mode: standalone). A normal browser tab can't see that the app was
 * installed, so we also persist an "installed / acknowledged" flag: set it when
 * the browser reports an install (appinstalled / getInstalledRelatedApps), when
 * we ever run standalone, or when the user says they've already installed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALLED_KEY = "rentpact:pwa-installed:v1";

function readInstalledFlag(): boolean {
  try {
    return window.localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeInstalledFlag(): void {
  try {
    window.localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    /* ignore */
  }
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
    writeInstalledFlag();
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

/** True when RentPact is currently running as an installed app. */
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
  installed: boolean; // running standalone OR installed/acknowledged before
  canPrompt: boolean; // native one-tap install available
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  markInstalled: () => void; // "I've already installed it" — hides the prompt for good
}

export function useInstall(): InstallState {
  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());

    const sa = isStandalone();
    setStandalone(sa);
    if (sa) writeInstalledFlag();
    setInstalled(sa || readInstalledFlag());
    setCanPrompt(deferred !== null);

    // Best-effort: Chrome can tell us the PWA is already installed, even across
    // sessions. Not available on iOS/Firefox — hence the manual fallback.
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    if (typeof nav.getInstalledRelatedApps === "function") {
      nav
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            writeInstalledFlag();
            setInstalled(true);
          }
        })
        .catch(() => {});
    }

    const update = () => {
      setCanPrompt(deferred !== null);
      const s = isStandalone();
      setStandalone(s);
      setInstalled(s || readInstalledFlag());
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

  const markInstalled = () => {
    writeInstalledFlag();
    setInstalled(true);
    emit();
  };

  return { mounted, platform, standalone, installed, canPrompt, promptInstall, markInstalled };
}
