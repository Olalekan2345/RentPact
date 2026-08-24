import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Web Push sender. Best-effort throughout — a failed push must never break the
 * action that triggered it (message send, etc.). VAPID keys come from env; if
 * they're not set (e.g. before the user configures them), push is silently a
 * no-op so nothing errors.
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:rentpact1@gmail.com";

let configured: boolean | null = null;
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function savePushSubscription(email: string, sub: PushSubscriptionInput): Promise<void> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
  await supabaseAdmin()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        email: email.trim().toLowerCase(),
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        created_at: Date.now(),
      },
      { onConflict: "endpoint" },
    );
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Sends a push to every device this email has subscribed. Prunes dead subs. */
export async function sendPushToEmail(email: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const normalized = email.trim().toLowerCase();

  try {
    const { data } = await supabaseAdmin().from("push_subscriptions").select().eq("email", normalized);
    const subs = data ?? [];
    await Promise.all(
      subs.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          // 404/410 mean the subscription is gone (browser cleared it) — prune it.
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", row.endpoint);
          }
        }
      }),
    );
  } catch {
    // Never let a push failure bubble into the caller.
  }
}
