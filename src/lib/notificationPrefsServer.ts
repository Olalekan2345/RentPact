import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profileServer";

/**
 * Per-category in-app notification preferences. Only "in-app" is a real,
 * working toggle here (it filters what the bell shows) — email and push are
 * not wired to any delivery mechanism in this project (no email/SMS
 * provider is configured), so the settings UI shows them as visibly
 * disabled "coming soon" controls rather than toggles that silently do
 * nothing.
 */

export type NotificationCategory = "money" | "lease" | "maintenance" | "dispute" | "messages";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ["money", "lease", "maintenance", "dispute", "messages"];

export type NotificationPrefs = Record<NotificationCategory, boolean>;

function defaultPrefs(): NotificationPrefs {
  return { money: true, lease: true, maintenance: true, dispute: true, messages: true };
}

export async function getPrefs(email: string): Promise<NotificationPrefs> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin().from("notification_prefs").select().eq("email", normalized).maybeSingle();
  if (!data) return defaultPrefs();
  return {
    money: data.money,
    lease: data.lease,
    maintenance: data.maintenance,
    dispute: data.dispute,
    messages: data.messages,
  };
}

export async function updatePrefs(email: string, updates: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const normalized = email.trim().toLowerCase();
  await ensureProfile(normalized);
  const db = supabaseAdmin();

  const { data: existing } = await db.from("notification_prefs").select().eq("email", normalized).maybeSingle();
  const existingPrefs: Partial<NotificationPrefs> = existing
    ? {
        money: existing.money,
        lease: existing.lease,
        maintenance: existing.maintenance,
        dispute: existing.dispute,
        messages: existing.messages,
      }
    : {};
  const merged = { ...defaultPrefs(), ...existingPrefs, ...updates };

  const { error } = await db
    .from("notification_prefs")
    .upsert({ email: normalized, ...merged }, { onConflict: "email" });
  if (error) throw error;

  return merged;
}
