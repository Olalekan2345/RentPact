import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profileServer";
import { sendPushToEmail } from "@/lib/pushServer";
import { HttpError, type SessionUser } from "@/lib/sessionServer";
import {
  DOCUMENT_RETENTION_DAYS,
  ID_TYPES,
  LANDLORD_CHECKS,
  PROPERTY_CHECKS,
  PUBLIC_CHECK_LABELS,
  TITLE_DOCUMENT_TYPES,
  requiredChecks,
  type DocumentKind,
  type LandlordRole,
  type LandlordVerificationStatus,
  type ListingVerificationStatus,
  type ListingVerificationSummary,
  type VerificationDocument,
} from "@/lib/verificationModel";

/**
 * Landlord & property verification — the anti-scam gate in front of every listing.
 *
 *   1. A landlord applies once (ID, phone, and for agents a LASRERA certificate). The RentPact review team
 *      approves them after a video call. Only approved landlords can publish listings.
 *   2. Every new listing then carries its own ownership documents and stays out of search ("pending")
 *      until the team has checked them and done a live video walk-through of the property.
 *   3. Tenants can report a listing; the team can take it down or revoke the landlord, which also takes
 *      down all their listings.
 *
 * Reviewers are the emails in REVIEWER_EMAILS (comma-separated), starting with the arbiter account. ID and
 * title documents sit in a private bucket, are opened by reviewers through short-lived signed links, and are
 * deleted DOCUMENT_RETENTION_DAYS after a decision — only the record of what was checked is kept.
 */

const BUCKET = "verification-docs";
const SIGNED_URL_SECONDS = 10 * 60;
/** Statuses tenants can see and rent. */
export const PUBLIC_LISTING_STATUSES: ListingVerificationStatus[] = ["approved", "unverified"];

export class VerificationError extends HttpError {}

export function reviewerEmails(): string[] {
  return (process.env.REVIEWER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isReviewer = (email: string) => reviewerEmails().includes(email.trim().toLowerCase());

export function requireReviewer(user: SessionUser | null): SessionUser {
  if (!user) throw new VerificationError("Please sign in again to continue.", 401);
  if (!isReviewer(user.email)) throw new VerificationError("Only the RentPact review team can do this.", 403);
  return user;
}

const notify = (email: string, title: string, body: string, url: string) =>
  sendPushToEmail(email, { title, body, url, tag: "verification" }).catch(() => undefined);

// ─── Documents ──────────────────────────────────────────────────────────────

/**
 * Accepts only documents the caller uploaded themselves (their own folder in the private bucket), of the
 * expected kinds, and returns them cleaned.
 */
function ownDocuments(user: SessionUser, raw: unknown, allowed: DocumentKind[]): VerificationDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d) => {
    const kind = d?.kind as DocumentKind;
    const path = typeof d?.path === "string" ? d.path : "";
    const name = typeof d?.name === "string" ? d.name.slice(0, 200) : "document";
    if (!allowed.includes(kind) || !path.startsWith(`${user.id}/`) || path.includes("..")) return [];
    return [{ kind, path, name }];
  });
}

const hasKind = (docs: VerificationDocument[], kind: DocumentKind) => docs.some((d) => d.kind === kind);

async function deleteFiles(docs: VerificationDocument[]) {
  const paths = docs.map((d) => d.path);
  if (paths.length > 0) await supabaseAdmin().storage.from(BUCKET).remove(paths);
}

async function withSignedUrls(docs: VerificationDocument[]) {
  if (docs.length === 0) return [];
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrls(
      docs.map((d) => d.path),
      SIGNED_URL_SECONDS,
    );
  return docs.map((d, i) => ({ ...d, url: data?.[i]?.signedUrl ?? null }));
}

/** Deletes documents of decisions older than the retention window. Cheap; run on each review-queue load. */
async function purgeExpiredDocuments() {
  const cutoff = Date.now() - DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const db = supabaseAdmin();
  const { data: landlords } = await db.from("landlord_verifications").select("email, documents").lt("reviewed_at", cutoff);
  for (const row of (landlords ?? []).filter((r) => r.documents.length > 0)) {
    await deleteFiles(row.documents);
    await db.from("landlord_verifications").update({ documents: [] }).eq("email", row.email);
  }
  const { data: properties } = await db.from("listing_verifications").select("listing_id, documents").lt("reviewed_at", cutoff);
  for (const row of (properties ?? []).filter((r) => r.documents.length > 0)) {
    await deleteFiles(row.documents);
    await db.from("listing_verifications").update({ documents: [] }).eq("listing_id", row.listing_id);
  }
}

// ─── Landlords ──────────────────────────────────────────────────────────────

interface LandlordRow {
  email: string;
  status: Exclude<LandlordVerificationStatus, "none">;
  full_name: string;
  phone: string;
  role: LandlordRole;
  id_type: string;
  lasrera_number: string | null;
  documents: VerificationDocument[];
  submitted_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_note: string | null;
  checks: Record<string, boolean>;
}

/** A landlord's own view of their application (never includes document paths). */
export interface MyVerification {
  status: LandlordVerificationStatus;
  role: LandlordRole | null;
  fullName: string | null;
  submittedAt: number | null;
  reviewedAt: number | null;
  note: string | null;
}

async function landlordRow(email: string): Promise<LandlordRow | null> {
  const { data } = await supabaseAdmin()
    .from("landlord_verifications")
    .select()
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return (data as LandlordRow | null) ?? null;
}

export async function getMyVerification(email: string): Promise<MyVerification> {
  const row = await landlordRow(email);
  return {
    status: row?.status ?? "none",
    role: row?.role ?? null,
    fullName: row?.full_name ?? null,
    submittedAt: row?.submitted_at ?? null,
    reviewedAt: row?.reviewed_at ?? null,
    note: row && (row.status === "rejected" || row.status === "revoked") ? row.review_note : null,
  };
}

export async function landlordStatus(email: string): Promise<{ status: LandlordVerificationStatus; role: LandlordRole | null }> {
  const row = await landlordRow(email);
  return { status: row?.status ?? "none", role: row?.role ?? null };
}

/** email → when they were approved, for every approved landlord among `emails`. */
export async function approvedLandlords(emails: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  if (unique.length === 0) return new Map();
  const { data } = await supabaseAdmin()
    .from("landlord_verifications")
    .select("email, reviewed_at")
    .in("email", unique)
    .eq("status", "approved");
  return new Map((data ?? []).map((r) => [r.email as string, (r.reviewed_at as number) ?? 0]));
}

export async function submitLandlordApplication(user: SessionUser, body: Record<string, unknown>) {
  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const role = body.role === "agent" ? "agent" : body.role === "owner" ? "owner" : null;
  const idType = String(body.idType ?? "");
  const lasreraNumber = String(body.lasreraNumber ?? "").trim();
  const documents = ownDocuments(user, body.documents, ["id", "lasrera"]);

  if (fullName.length < 3) throw new VerificationError("Enter your full name as it appears on your ID.", 400);
  if (phone.replace(/\D/g, "").length < 10) throw new VerificationError("Enter a phone number we can call you on.", 400);
  if (!role) throw new VerificationError("Choose whether you own the property or manage it for the owner.", 400);
  if (!ID_TYPES.some((t) => t.value === idType)) throw new VerificationError("Choose your ID type.", 400);
  if (!hasKind(documents, "id")) throw new VerificationError("Upload a photo or scan of your ID.", 400);
  if (role === "agent" && (!lasreraNumber || !hasKind(documents, "lasrera"))) {
    throw new VerificationError("Agents and caretakers need their LASRERA registration number and certificate.", 400);
  }

  const existing = await landlordRow(user.email);
  if (existing?.status === "approved") throw new VerificationError("You're already verified.", 409);
  if (existing?.status === "revoked") {
    throw new VerificationError("Your verification was revoked. Please contact RentPact support.", 403);
  }

  await ensureProfile(user.email);
  const { error } = await supabaseAdmin()
    .from("landlord_verifications")
    .upsert({
      email: user.email,
      status: "pending",
      full_name: fullName.slice(0, 120),
      phone: phone.slice(0, 40),
      role,
      id_type: idType,
      lasrera_number: role === "agent" ? lasreraNumber.slice(0, 60) : null,
      documents,
      submitted_at: Date.now(),
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      checks: {},
    });
  if (error) throw error;
  // A resubmission replaces the earlier documents.
  if (existing) await deleteFiles(existing.documents.filter((d) => !documents.some((n) => n.path === d.path)));
}

export async function decideLandlord(
  reviewer: SessionUser,
  email: string,
  decision: "approve" | "reject" | "revoke",
  note: string,
  checks: Record<string, boolean>,
) {
  const row = await landlordRow(email);
  if (!row) throw new VerificationError("Application not found.", 404);
  if (decision === "revoke" ? row.status !== "approved" : row.status !== "pending") {
    throw new VerificationError("This application has already been decided.", 409);
  }
  if (decision === "approve") {
    const missing = requiredChecks(LANDLORD_CHECKS, row.role).filter((k) => !checks[k]);
    if (missing.length > 0) throw new VerificationError("Tick every required check before approving.", 400);
  } else if (note.trim().length < 5) {
    throw new VerificationError("Give the landlord a short reason.", 400);
  }

  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revoked";
  const db = supabaseAdmin();
  const { error } = await db
    .from("landlord_verifications")
    .update({
      status,
      reviewed_by: reviewer.email,
      reviewed_at: Date.now(),
      review_note: note.trim().slice(0, 1000) || null,
      checks: decision === "approve" ? checks : row.checks,
    })
    .eq("email", row.email);
  if (error) throw error;

  if (decision === "revoke") {
    // A revoked landlord's houses come off the market at once.
    await db.from("listings").update({ active: false }).eq("landlord_email", row.email).eq("active", true);
  }

  const messages = {
    approve: ["You're a verified landlord", "You can now list properties on RentPact."],
    reject: ["Verification needs another look", "Open RentPact to see what to fix and resubmit."],
    revoke: ["Your verification was revoked", "Your listings have been taken down. Open RentPact for details."],
  } as const;
  await notify(row.email, messages[decision][0], messages[decision][1], "/verify");
}

// ─── Properties ─────────────────────────────────────────────────────────────

interface ListingVerificationRow {
  listing_id: string;
  landlord_email: string;
  title_document_type: string | null;
  documents: VerificationDocument[];
  submitted_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_note: string | null;
  checks: Record<string, boolean>;
}

/**
 * Validates a property's ownership documents. Throws a VerificationError naming what's missing; returns the
 * cleaned documents. Call before creating the listing, so a bad upload never leaves a half-made listing.
 */
export function checkPropertyDocuments(
  user: SessionUser,
  role: LandlordRole | null,
  body: { titleDocumentType?: unknown; documents?: unknown },
) {
  const titleDocumentType = String(body.titleDocumentType ?? "");
  const documents = ownDocuments(user, body.documents, ["title", "bill", "authority"]);
  if (!TITLE_DOCUMENT_TYPES.some((t) => t.value === titleDocumentType)) {
    throw new VerificationError("Choose the type of title document.", 400);
  }
  if (!hasKind(documents, "title")) throw new VerificationError("Upload the property's title document.", 400);
  if (!hasKind(documents, "bill")) {
    throw new VerificationError("Upload a recent Land Use Charge or electricity bill for this address.", 400);
  }
  if (role === "agent" && !hasKind(documents, "authority")) {
    throw new VerificationError("Upload the owner's signed letter of authority for this property.", 400);
  }
  return { titleDocumentType, documents };
}

/** Puts a listing into the review queue with its documents. */
export async function submitPropertyDocuments(
  listingId: string,
  landlordEmail: string,
  property: { titleDocumentType: string; documents: VerificationDocument[] },
) {
  const db = supabaseAdmin();
  const { data: previous } = await db.from("listing_verifications").select("documents").eq("listing_id", listingId).maybeSingle();
  const { error } = await db.from("listing_verifications").upsert({
    listing_id: listingId,
    landlord_email: landlordEmail,
    title_document_type: property.titleDocumentType,
    documents: property.documents,
    submitted_at: Date.now(),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    checks: {},
  });
  if (error) throw error;
  await db.from("listings").update({ verification_status: "pending", verified_at: null }).eq("id", listingId);
  if (previous) {
    const replaced = ((previous.documents as VerificationDocument[]) ?? []).filter(
      (d) => !property.documents.some((n) => n.path === d.path),
    );
    await deleteFiles(replaced);
  }
}

const sameAddress = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * "List again" for a property RentPact already checked: the same landlord re-listing the same address keeps
 * its approval instead of waiting in the queue again. Returns whether it carried over.
 */
export async function carryOverApproval(
  fromListingId: string,
  newListingId: string,
  landlordEmail: string,
  propertyAddress: string,
): Promise<boolean> {
  const db = supabaseAdmin();
  const [{ data: from }, { data: fromCheck }] = await Promise.all([
    db.from("listings").select("landlord_email, property_address, verification_status, verified_at").eq("id", fromListingId).maybeSingle(),
    db.from("listing_verifications").select("title_document_type, checks, reviewed_by").eq("listing_id", fromListingId).maybeSingle(),
  ]);
  if (
    !from ||
    from.landlord_email !== landlordEmail ||
    from.verification_status !== "approved" ||
    !sameAddress(from.property_address, propertyAddress)
  ) {
    return false;
  }
  await db.from("listing_verifications").upsert({
    listing_id: newListingId,
    landlord_email: landlordEmail,
    title_document_type: fromCheck?.title_document_type ?? null,
    documents: [],
    submitted_at: Date.now(),
    reviewed_by: fromCheck?.reviewed_by ?? null,
    reviewed_at: Date.now(),
    review_note: `Carried over from listing ${fromListingId}`,
    checks: fromCheck?.checks ?? {},
  });
  await db.from("listings").update({ verification_status: "approved", verified_at: from.verified_at }).eq("id", newListingId);
  return true;
}

export async function listingVerificationSummary(
  listingId: string,
  status: ListingVerificationStatus,
  verifiedAt: number | null,
  forOwner: boolean,
): Promise<ListingVerificationSummary> {
  const { data } = await supabaseAdmin()
    .from("listing_verifications")
    .select("checks, review_note")
    .eq("listing_id", listingId)
    .maybeSingle();
  const checks = (data?.checks as Record<string, boolean> | undefined) ?? {};
  return {
    status,
    verifiedAt,
    checked: status === "approved" ? Object.keys(checks).filter((k) => checks[k] && PUBLIC_CHECK_LABELS[k]).map((k) => PUBLIC_CHECK_LABELS[k]) : [],
    note: forOwner && status === "rejected" ? ((data?.review_note as string | null) ?? null) : undefined,
  };
}

export async function decideListing(
  reviewer: SessionUser,
  listingId: string,
  decision: "approve" | "reject",
  note: string,
  checks: Record<string, boolean>,
) {
  const db = supabaseAdmin();
  const { data: listing } = await db
    .from("listings")
    .select("id, landlord_email, property_address, verification_status")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) throw new VerificationError("Listing not found.", 404);
  if (listing.verification_status !== "pending") throw new VerificationError("This listing has already been decided.", 409);

  const { role } = await landlordStatus(listing.landlord_email);
  if (decision === "approve") {
    const missing = requiredChecks(PROPERTY_CHECKS, role).filter((k) => !checks[k]);
    if (missing.length > 0) throw new VerificationError("Tick every required check before approving.", 400);
  } else if (note.trim().length < 5) {
    throw new VerificationError("Give the landlord a short reason.", 400);
  }

  const now = Date.now();
  await db
    .from("listing_verifications")
    .update({
      reviewed_by: reviewer.email,
      reviewed_at: now,
      review_note: note.trim().slice(0, 1000) || null,
      checks: decision === "approve" ? checks : {},
    })
    .eq("listing_id", listingId);
  const { error } = await db
    .from("listings")
    .update(decision === "approve" ? { verification_status: "approved", verified_at: now } : { verification_status: "rejected" })
    .eq("id", listingId);
  if (error) throw error;

  await notify(
    listing.landlord_email,
    decision === "approve" ? "Your property is verified and live" : "Your property needs another look",
    decision === "approve"
      ? `${listing.property_address} now shows to tenants as verified.`
      : `Open RentPact to see what to fix for ${listing.property_address}.`,
    `/listings/${listingId}`,
  );
}

// ─── Reports ────────────────────────────────────────────────────────────────

export async function reportListing(reporterEmail: string, listingId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 10) throw new VerificationError("Tell us a little more about what's wrong.", 400);
  const db = supabaseAdmin();
  const { data: listing } = await db.from("listings").select("landlord_email").eq("id", listingId).maybeSingle();
  if (!listing) throw new VerificationError("Listing not found.", 404);
  if (listing.landlord_email === reporterEmail) throw new VerificationError("You can't report your own listing.", 400);
  const { data: open } = await db
    .from("listing_reports")
    .select("id")
    .eq("listing_id", listingId)
    .eq("reporter_email", reporterEmail)
    .is("resolved_at", null)
    .limit(1);
  if ((open ?? []).length > 0) throw new VerificationError("You've already reported this listing. We're looking into it.", 409);
  const { error } = await db.from("listing_reports").insert({
    id: crypto.randomUUID(),
    listing_id: listingId,
    reporter_email: reporterEmail,
    reason: text.slice(0, 2000),
    created_at: Date.now(),
  });
  if (error) throw error;
  for (const reviewer of reviewerEmails()) {
    await notify(reviewer, "A listing was reported", text.slice(0, 120), "/review");
  }
}

export async function resolveReport(
  reviewer: SessionUser,
  reportId: string,
  action: "dismiss" | "take-down" | "revoke-landlord",
  note: string,
) {
  const db = supabaseAdmin();
  const { data: report } = await db.from("listing_reports").select("id, listing_id, resolved_at").eq("id", reportId).maybeSingle();
  if (!report) throw new VerificationError("Report not found.", 404);
  if (report.resolved_at) throw new VerificationError("This report has already been handled.", 409);

  if (action === "take-down") {
    await db.from("listings").update({ active: false }).eq("id", report.listing_id);
  } else if (action === "revoke-landlord") {
    const { data: listing } = await db.from("listings").select("landlord_email").eq("id", report.listing_id).maybeSingle();
    if (!listing) throw new VerificationError("Listing not found.", 404);
    const status = (await landlordRow(listing.landlord_email))?.status;
    if (status === "approved") {
      await decideLandlord(reviewer, listing.landlord_email, "revoke", note.trim() || "Revoked after a tenant report.", {});
    } else {
      await db.from("listings").update({ active: false }).eq("landlord_email", listing.landlord_email).eq("active", true);
    }
  }
  await db
    .from("listing_reports")
    .update({ resolved_at: Date.now(), resolved_by: reviewer.email, resolution: `${action}${note.trim() ? `: ${note.trim().slice(0, 500)}` : ""}` })
    .eq("id", reportId);
}

// ─── Review queue ───────────────────────────────────────────────────────────

export async function reviewQueue() {
  await purgeExpiredDocuments().catch(() => undefined);
  const db = supabaseAdmin();
  const [landlords, approved, propertyRows, reports] = await Promise.all([
    db.from("landlord_verifications").select().eq("status", "pending").order("submitted_at", { ascending: true }),
    db.from("landlord_verifications").select("email, full_name, role, reviewed_at, reviewed_by").eq("status", "approved").order("reviewed_at", { ascending: false }),
    db.from("listings").select("id, landlord_email, property_address, property_type, photo_url, created_at").eq("verification_status", "pending").order("created_at", { ascending: true }),
    db.from("listing_reports").select().is("resolved_at", null).order("created_at", { ascending: true }),
  ]);

  const pendingLandlords = await Promise.all(
    ((landlords.data ?? []) as LandlordRow[]).map(async (r) => ({
      email: r.email,
      fullName: r.full_name,
      phone: r.phone,
      role: r.role,
      idType: r.id_type,
      lasreraNumber: r.lasrera_number,
      submittedAt: r.submitted_at,
      documents: await withSignedUrls(r.documents ?? []),
    })),
  );

  const pendingIds = (propertyRows.data ?? []).map((l) => l.id as string);
  const { data: checks } = pendingIds.length
    ? await db.from("listing_verifications").select().in("listing_id", pendingIds)
    : { data: [] as ListingVerificationRow[] };
  const byListing = new Map(((checks ?? []) as ListingVerificationRow[]).map((c) => [c.listing_id, c]));
  const landlordInfo = new Map<string, LandlordRow | null>();
  for (const email of new Set((propertyRows.data ?? []).map((l) => l.landlord_email as string))) {
    landlordInfo.set(email, await landlordRow(email));
  }
  const pendingProperties = await Promise.all(
    (propertyRows.data ?? []).map(async (l) => {
      const check = byListing.get(l.id as string);
      const owner = landlordInfo.get(l.landlord_email as string);
      return {
        listingId: l.id as string,
        propertyAddress: l.property_address as string,
        propertyType: l.property_type as string,
        photoUrl: (l.photo_url as string | null) ?? null,
        landlordEmail: l.landlord_email as string,
        landlordName: owner?.full_name ?? null,
        landlordPhone: owner?.phone ?? null,
        landlordRole: owner?.role ?? null,
        titleDocumentType: check?.title_document_type ?? null,
        submittedAt: check?.submitted_at ?? (l.created_at as number),
        documents: await withSignedUrls(check?.documents ?? []),
      };
    }),
  );

  const reportListingIds = [...new Set((reports.data ?? []).map((r) => r.listing_id as string))];
  const { data: reportedListings } = reportListingIds.length
    ? await db.from("listings").select("id, property_address, landlord_email, active").in("id", reportListingIds)
    : { data: [] as { id: string; property_address: string; landlord_email: string; active: boolean }[] };
  const listingById = new Map((reportedListings ?? []).map((l) => [l.id as string, l]));

  return {
    landlords: pendingLandlords,
    properties: pendingProperties,
    reports: (reports.data ?? []).map((r) => {
      const l = listingById.get(r.listing_id as string);
      return {
        id: r.id as string,
        listingId: r.listing_id as string,
        propertyAddress: (l?.property_address as string | undefined) ?? "Listing",
        landlordEmail: (l?.landlord_email as string | undefined) ?? "",
        listingActive: Boolean(l?.active),
        reporterEmail: r.reporter_email as string,
        reason: r.reason as string,
        createdAt: r.created_at as number,
      };
    }),
    verifiedLandlords: (approved.data ?? []).map((r) => ({
      email: r.email as string,
      fullName: r.full_name as string,
      role: r.role as LandlordRole,
      reviewedAt: (r.reviewed_at as number | null) ?? null,
      reviewedBy: (r.reviewed_by as string | null) ?? null,
    })),
  };
}

export type ReviewQueue = Awaited<ReturnType<typeof reviewQueue>>;
