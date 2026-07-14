import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profileServer";

/** What's visible on a user's public profile (lib.app/u/[email]) to other users. */

export interface PrivacyPrefs {
  showReputation: boolean;
  showRentalHistory: boolean;
  showReviews: boolean;
}

function defaultPrefs(): PrivacyPrefs {
  return { showReputation: true, showRentalHistory: true, showReviews: true };
}

function fromRow(row: { show_reputation: boolean; show_rental_history: boolean; show_reviews: boolean }): PrivacyPrefs {
  return {
    showReputation: row.show_reputation,
    showRentalHistory: row.show_rental_history,
    showReviews: row.show_reviews,
  };
}

export async function getPrivacyPrefs(email: string): Promise<PrivacyPrefs> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin().from("privacy_prefs").select().eq("email", normalized).maybeSingle();
  return data ? fromRow(data) : defaultPrefs();
}

export async function updatePrivacyPrefs(email: string, updates: Partial<PrivacyPrefs>): Promise<PrivacyPrefs> {
  const normalized = email.trim().toLowerCase();
  await ensureProfile(normalized);
  const db = supabaseAdmin();

  const { data: existing } = await db.from("privacy_prefs").select().eq("email", normalized).maybeSingle();
  const merged = { ...defaultPrefs(), ...(existing ? fromRow(existing) : {}), ...updates };

  const { error } = await db.from("privacy_prefs").upsert(
    {
      email: normalized,
      show_reputation: merged.showReputation,
      show_rental_history: merged.showRentalHistory,
      show_reviews: merged.showReviews,
    },
    { onConflict: "email" },
  );
  if (error) throw error;

  return merged;
}

export async function deleteAllUserData(email: string): Promise<void> {
  await supabaseAdmin().from("privacy_prefs").delete().eq("email", email.trim().toLowerCase());
}
