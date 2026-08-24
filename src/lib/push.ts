/**
 * Client-side Web Push helpers. The service worker (/sw.js) is push-only — no
 * fetch handler — so registering it can't affect the app's networking.
 */

export type PushState = "unsupported" | "not-configured" | "default" | "granted" | "denied";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current state, for rendering the opt-in control. */
export function getPushState(): PushState {
  if (!isPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  return Notification.permission as "default" | "granted" | "denied";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Registers the SW, asks permission, subscribes to Web Push, and stores the
 * subscription server-side for this email. Returns the resulting state.
 */
export async function enablePush(email: string): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as "default" | "denied";

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }));

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, subscription: subscription.toJSON() }),
  });

  return "granted";
}

/** True only if permission is granted AND there's a live push subscription. */
export async function getPushEnabled(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/** Turns push off: unsubscribes the browser and removes the subscription server-side. */
export async function disablePush(email: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, endpoint }),
    });
  } catch {
    // best-effort — the browser unsubscribe is what actually stops delivery
  }
}
