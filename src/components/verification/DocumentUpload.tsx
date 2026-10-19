"use client";

import { useState, type ChangeEvent } from "react";
import { uploadVerificationDocument } from "@/lib/verification";
import { DOCUMENT_MIME_TYPES, TITLE_DOCUMENT_TYPES, type DocumentKind, type LandlordRole, type VerificationDocument } from "@/lib/verificationModel";
import type { PropertyDocuments } from "@/lib/listings";

/** One required document: pick a photo or PDF, it uploads to private storage, and the file name shows. */
export function DocumentUpload({
  kind,
  label,
  hint,
  value,
  onChange,
}: {
  kind: DocumentKind;
  label: string;
  hint?: string;
  value: VerificationDocument | null;
  onChange: (doc: VerificationDocument | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      onChange(await uploadVerificationDocument(file, kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-forest-100 bg-forest-50 px-3 py-2.5 text-sm">
          <span className="truncate font-medium text-forest-500">✓ {value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-xs font-medium text-terracotta-500 underline">
            Replace
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-forest-200 bg-cream-50 px-3 py-3 text-sm font-medium text-forest-500 hover:bg-forest-50">
          {uploading ? "Uploading…" : "Choose a photo or PDF"}
          <input type="file" accept={DOCUMENT_MIME_TYPES.join(",")} className="hidden" disabled={uploading} onChange={handleFile} />
        </label>
      )}
      {error && <p className="text-xs text-terracotta-500">{error}</p>}
    </div>
  );
}

/** Keeps one document per kind in a list. */
export function setDocument(docs: VerificationDocument[], kind: DocumentKind, doc: VerificationDocument | null) {
  return [...docs.filter((d) => d.kind !== kind), ...(doc ? [doc] : [])];
}

export const documentOf = (docs: VerificationDocument[], kind: DocumentKind) => docs.find((d) => d.kind === kind) ?? null;

/** Whether a property's documents are complete for this kind of landlord. */
export function propertyDocumentsComplete(value: PropertyDocuments, role: LandlordRole | null) {
  const has = (k: DocumentKind) => value.documents.some((d) => d.kind === k);
  return Boolean(value.titleDocumentType) && has("title") && has("bill") && (role !== "agent" || has("authority"));
}

/** The ownership documents every property needs before it goes live. */
export function PropertyDocumentsForm({
  value,
  onChange,
  role,
}: {
  value: PropertyDocuments;
  onChange: (next: PropertyDocuments) => void;
  role: LandlordRole | null;
}) {
  const set = (kind: DocumentKind) => (doc: VerificationDocument | null) =>
    onChange({ ...value, documents: setDocument(value.documents, kind, doc) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-muted">Title document</label>
        <select
          value={value.titleDocumentType}
          onChange={(e) => onChange({ ...value, titleDocumentType: e.target.value })}
          className="h-11 rounded-md border border-forest-100 bg-cream-50 px-4 text-[15px] text-ink"
        >
          <option value="">Choose one…</option>
          {TITLE_DOCUMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <DocumentUpload
        kind="title"
        label="Upload the title document"
        hint="Every page, clearly readable. The name on it must match yours, or the owner's on your letter of authority."
        value={documentOf(value.documents, "title")}
        onChange={set("title")}
      />
      <DocumentUpload
        kind="bill"
        label="Recent bill for this exact address"
        hint="A Land Use Charge notice or an electricity bill from the last 6 months."
        value={documentOf(value.documents, "bill")}
        onChange={set("bill")}
      />
      {role === "agent" && (
        <DocumentUpload
          kind="authority"
          label="Owner's letter of authority"
          hint="Signed by the owner named on the title document, authorising you to let this property."
          value={documentOf(value.documents, "authority")}
          onChange={set("authority")}
        />
      )}
      <p className="rounded-md bg-forest-50 px-4 py-3 text-xs text-forest-500">
        Our team will also arrange a short live video walk-through of the property before it goes live. Your documents
        are private: only the RentPact review team can open them, tenants never see them, and they&apos;re deleted 30
        days after our decision.
      </p>
    </div>
  );
}
