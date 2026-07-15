/**
 * One-off migration: move base64 `data:` URLs out of database rows into
 * Supabase Storage, replacing them with public URLs.
 *
 * Covers every field that historically stored base64 media:
 *   listings.photo_url, listings.condition (photos[].url, videoUrl)
 *   lease_metadata.photo_url
 *   messages.maintenance (photos[], videoUrl)
 *   move_out_conditions.photos (photos[].url)
 *   profiles.photo_url
 *
 * Run locally (uses the service-role key; never ship this to the client):
 *   node --env-file=.env.local scripts/migrate-photos-to-storage.mjs
 *
 * Idempotent: rows already holding https:// URLs are skipped.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — run with --env-file=.env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "photos";
let uploaded = 0;

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

async function migrateDataUrl(dataUrl, folder) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return dataUrl;
  const comma = dataUrl.indexOf(",");
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "application/octet-stream";
  const buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const path = `migrated/${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`upload failed (${folder}): ${error.message}`);

  uploaded++;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function migrateListings() {
  const { data: rows, error } = await supabase.from("listings").select("id, photo_url, condition");
  if (error) throw error;
  for (const row of rows ?? []) {
    const patch = {};
    if (row.photo_url?.startsWith("data:")) {
      patch.photo_url = await migrateDataUrl(row.photo_url, "listings");
    }
    if (row.condition) {
      const condition = row.condition;
      let changed = false;
      for (const photo of condition.photos ?? []) {
        if (photo.url?.startsWith("data:")) {
          photo.url = await migrateDataUrl(photo.url, "condition");
          changed = true;
        }
      }
      if (condition.videoUrl?.startsWith("data:")) {
        condition.videoUrl = await migrateDataUrl(condition.videoUrl, "videos");
        changed = true;
      }
      if (changed) patch.condition = condition;
    }
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase.from("listings").update(patch).eq("id", row.id);
      if (updateError) throw updateError;
      console.log(`listings ${row.id}: migrated`);
    }
  }
}

async function migrateLeaseMetadata() {
  const { data: rows, error } = await supabase.from("lease_metadata").select("lease_id, photo_url");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.photo_url?.startsWith("data:")) {
      const photo_url = await migrateDataUrl(row.photo_url, "listings");
      const { error: updateError } = await supabase.from("lease_metadata").update({ photo_url }).eq("lease_id", row.lease_id);
      if (updateError) throw updateError;
      console.log(`lease_metadata ${row.lease_id}: migrated`);
    }
  }
}

async function migrateMessages() {
  const { data: rows, error } = await supabase.from("messages").select("id, maintenance").not("maintenance", "is", null);
  if (error) throw error;
  for (const row of rows ?? []) {
    const maintenance = row.maintenance;
    let changed = false;
    if (Array.isArray(maintenance.photos)) {
      for (let i = 0; i < maintenance.photos.length; i++) {
        if (maintenance.photos[i]?.startsWith("data:")) {
          maintenance.photos[i] = await migrateDataUrl(maintenance.photos[i], "maintenance");
          changed = true;
        }
      }
    }
    if (maintenance.videoUrl?.startsWith("data:")) {
      maintenance.videoUrl = await migrateDataUrl(maintenance.videoUrl, "maintenance");
      changed = true;
    }
    if (changed) {
      const { error: updateError } = await supabase.from("messages").update({ maintenance }).eq("id", row.id);
      if (updateError) throw updateError;
      console.log(`messages ${row.id}: migrated`);
    }
  }
}

async function migrateMoveOut() {
  const { data: rows, error } = await supabase.from("move_out_conditions").select("lease_id, photos");
  if (error) throw error;
  for (const row of rows ?? []) {
    let changed = false;
    for (const photo of row.photos ?? []) {
      if (photo.url?.startsWith("data:")) {
        photo.url = await migrateDataUrl(photo.url, "move-out");
        changed = true;
      }
    }
    if (changed) {
      const { error: updateError } = await supabase.from("move_out_conditions").update({ photos: row.photos }).eq("lease_id", row.lease_id);
      if (updateError) throw updateError;
      console.log(`move_out_conditions ${row.lease_id}: migrated`);
    }
  }
}

async function migrateProfiles() {
  const { data: rows, error } = await supabase.from("profiles").select("email, photo_url");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.photo_url?.startsWith("data:")) {
      const photo_url = await migrateDataUrl(row.photo_url, "avatars");
      const { error: updateError } = await supabase.from("profiles").update({ photo_url }).eq("email", row.email);
      if (updateError) throw updateError;
      console.log(`profiles ${row.email}: migrated`);
    }
  }
}

await migrateListings();
await migrateLeaseMetadata();
await migrateMessages();
await migrateMoveOut();
await migrateProfiles();
console.log(`Done — ${uploaded} file(s) moved to storage.`);
