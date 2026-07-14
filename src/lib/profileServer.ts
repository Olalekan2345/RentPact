import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Public profile info (name, photo) — the contract has no concept of this,
 * only wallet addresses, so it lives in its own Postgres table. "memberSince"
 * is set once, the first time a profile record is created for that email — a
 * real timestamp of first contact with this app, not a fabricated date.
 */

export interface UserProfile {
  email: string;
  name: string | null;
  photoUrl: string | null;
  memberSince: number;
}

function fromRow(row: { email: string; name: string | null; photo_url: string | null; member_since: number }): UserProfile {
  return { email: row.email, name: row.name, photoUrl: row.photo_url, memberSince: row.member_since };
}

export async function getProfile(email: string): Promise<UserProfile> {
  const normalized = email.trim().toLowerCase();
  const db = supabaseAdmin();

  const { data: existing } = await db.from("profiles").select().eq("email", normalized).maybeSingle();
  if (existing) return fromRow(existing);

  // First time we've seen this email — record real "member since" now.
  const memberSince = Date.now();
  const { data: created, error } = await db
    .from("profiles")
    .insert({ email: normalized, member_since: memberSince })
    .select()
    .single();

  if (error) {
    // Lost a create race — someone else inserted this email between our select and insert.
    const { data: raced } = await db.from("profiles").select().eq("email", normalized).single();
    if (raced) return fromRow(raced);
    throw error;
  }

  return fromRow(created);
}

/**
 * Guarantees a profiles row exists for this email, without fetching or
 * returning it. Several other tables (listings, templates, notification_prefs,
 * privacy_prefs) have a foreign key to profiles(email) — call this before
 * inserting into any of them for an email that might be touching the app for
 * the first time (mirrors the auto-vivification getProfile() already does).
 */
export async function ensureProfile(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const db = supabaseAdmin();

  const { data: existing } = await db.from("profiles").select("email").eq("email", normalized).maybeSingle();
  if (existing) return;

  const { error } = await db.from("profiles").insert({ email: normalized, member_since: Date.now() });
  // Ignore unique-violation (23505) — a concurrent request already created it.
  if (error && error.code !== "23505") throw error;
}

export async function updateProfile(
  email: string,
  updates: { name?: string | null; photoUrl?: string | null },
): Promise<UserProfile> {
  const normalized = email.trim().toLowerCase();
  const db = supabaseAdmin();

  const { data: existing } = await db.from("profiles").select().eq("email", normalized).maybeSingle();

  if (!existing) {
    const { data: created, error } = await db
      .from("profiles")
      .insert({
        email: normalized,
        member_since: Date.now(),
        name: updates.name ?? null,
        photo_url: updates.photoUrl ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(created);
  }

  const patch: { name?: string | null; photo_url?: string | null } = {};
  if ("name" in updates) patch.name = updates.name ?? null;
  if ("photoUrl" in updates) patch.photo_url = updates.photoUrl ?? null;

  const { data, error } = await db.from("profiles").update(patch).eq("email", normalized).select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteProfile(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await supabaseAdmin().from("profiles").delete().eq("email", normalized);
}
