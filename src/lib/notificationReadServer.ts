import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Read-state for the notification bell. Notifications themselves are never
 * stored — they're derived live from real events (activity feed, messages,
 * reviews) every time the bell is opened, the same "never fabricated, never
 * stored separately" principle used for reputation stats. This table only
 * tracks which of those derived notification ids a user has already seen,
 * since the underlying events (an on-chain log, a message) have no user-
 * specific read flag of their own — except messages, which carry their own
 * readAt and don't need an entry here at all.
 */

export async function listReadIds(email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("notification_reads")
    .select("notification_id")
    .eq("email", normalized);
  return (data ?? []).map((r) => r.notification_id);
}

export async function markRead(email: string, notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const normalized = email.trim().toLowerCase();
  const now = Date.now();

  const { error } = await supabaseAdmin()
    .from("notification_reads")
    .upsert(
      notificationIds.map((notificationId) => ({ email: normalized, notification_id: notificationId, read_at: now })),
      { onConflict: "email,notification_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}
