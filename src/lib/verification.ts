"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import {
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  type DocumentKind,
  type LandlordRole,
  type LandlordVerificationStatus,
  type VerificationDocument,
} from "@/lib/verificationModel";

export interface MyVerification {
  status: LandlordVerificationStatus;
  role: LandlordRole | null;
  fullName: string | null;
  submittedAt: number | null;
  reviewedAt: number | null;
  note: string | null;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body as T;
}

export async function fetchMyVerification(): Promise<{ verification: MyVerification; isReviewer: boolean } | null> {
  const res = await fetch("/api/verification", { cache: "no-store" });
  return res.ok ? res.json() : null;
}

export interface LandlordApplication {
  fullName: string;
  phone: string;
  role: LandlordRole;
  idType: string;
  lasreraNumber: string;
  documents: VerificationDocument[];
}

export async function submitLandlordApplication(input: LandlordApplication): Promise<MyVerification> {
  const res = await fetch("/api/verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ verification: MyVerification }>(res, "Could not send your application.")).verification;
}

export async function fetchLandlordBadge(email: string): Promise<{ verified: boolean; since: number | null }> {
  const res = await fetch(`/api/verification/landlord?email=${encodeURIComponent(email)}`);
  return res.ok ? res.json() : { verified: false, since: null };
}

/**
 * Uploads an ID or ownership document to the private verification bucket, into the signed-in user's own
 * folder (the only place storage lets them write). Nobody can read it back except the review team.
 */
export async function uploadVerificationDocument(file: File, kind: DocumentKind): Promise<VerificationDocument> {
  if (!DOCUMENT_MIME_TYPES.includes(file.type)) throw new Error("Upload a photo (JPG, PNG) or a PDF.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Files must be under 10 MB.");
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again to upload.");
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${user.id}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("verification-docs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("Could not upload that file. Please try again.");
  return { kind, path, name: file.name };
}

// ─── Review team ────────────────────────────────────────────────────────────

export interface SignedDocument extends VerificationDocument {
  url: string | null;
}

export interface ReviewQueue {
  landlords: {
    email: string;
    fullName: string;
    phone: string;
    role: LandlordRole;
    idType: string;
    lasreraNumber: string | null;
    submittedAt: number;
    documents: SignedDocument[];
  }[];
  properties: {
    listingId: string;
    propertyAddress: string;
    propertyType: string;
    photoUrl: string | null;
    landlordEmail: string;
    landlordName: string | null;
    landlordPhone: string | null;
    landlordRole: LandlordRole | null;
    titleDocumentType: string | null;
    submittedAt: number;
    documents: SignedDocument[];
  }[];
  reports: {
    id: string;
    listingId: string;
    propertyAddress: string;
    landlordEmail: string;
    listingActive: boolean;
    reporterEmail: string;
    reason: string;
    createdAt: number;
  }[];
  verifiedLandlords: {
    email: string;
    fullName: string;
    role: LandlordRole;
    reviewedAt: number | null;
    reviewedBy: string | null;
  }[];
}

export async function fetchReviewQueue(): Promise<ReviewQueue> {
  return json<ReviewQueue>(await fetch("/api/verification/review", { cache: "no-store" }), "Could not load the review queue.");
}

export type ReviewDecision =
  | { target: "landlord"; id: string; decision: "approve" | "reject" | "revoke" }
  | { target: "listing"; id: string; decision: "approve" | "reject" }
  | { target: "report"; id: string; decision: "dismiss" | "take-down" | "revoke-landlord" };

export async function submitReviewDecision(
  decision: ReviewDecision & { note?: string; checks?: Record<string, boolean> },
): Promise<void> {
  const res = await fetch("/api/verification/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
  });
  await json(res, "Could not save that decision.");
}
