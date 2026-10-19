"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent } from "@/components/ui";
import { reportListing, submitListingDocuments, type Listing, type PropertyDocuments } from "@/lib/listings";
import { fetchMyVerification, type MyVerification } from "@/lib/verification";
import type { ListingVerificationSummary } from "@/lib/verificationModel";
import { ListingVerificationBadge, ShieldCheckIcon, VerifiedLandlordBadge } from "./VerificationBadge";
import { PropertyDocumentsForm, propertyDocumentsComplete } from "./DocumentUpload";

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Trust on a listing page. Tenants see what RentPact checked (or that it hasn't been checked yet), how the
 * escrow protects their rent, and a way to report the listing. The landlord sees where their listing is in
 * review and can send documents when it needs them.
 */
export function ListingTrustPanel({
  listing,
  verification,
  isOwner,
  onChanged,
}: {
  listing: Listing;
  verification: ListingVerificationSummary;
  isOwner: boolean;
  onChanged: () => void;
}) {
  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Safety</p>
          <ListingVerificationBadge status={verification.status} />
        </div>
        {isOwner ? <OwnerView listing={listing} verification={verification} onChanged={onChanged} /> : <TenantView listing={listing} verification={verification} />}
      </CardContent>
    </Card>
  );
}

function TenantView({ listing, verification }: { listing: Listing; verification: ListingVerificationSummary }) {
  return (
    <>
      {verification.status === "approved" ? (
        <div className="rounded-md bg-forest-50 px-4 py-3 text-sm text-forest-500">
          <p className="flex items-center gap-1.5 font-semibold">
            <ShieldCheckIcon className="h-4 w-4" aria-hidden />
            Verified by RentPact{verification.verifiedAt ? ` on ${day(verification.verifiedAt)}` : ""}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {listing.landlordVerified && <li>✓ Landlord&apos;s identity</li>}
            {verification.checked.map((c) => (
              <li key={c}>✓ {c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-forest-400">
            Verification lowers the risk of fraud but isn&apos;t a guarantee. Inspect the property before you move in.
          </p>
        </div>
      ) : verification.status === "pending" || verification.status === "rejected" ? (
        <p className="rounded-md bg-gold-50 px-4 py-3 text-sm text-gold-700">
          This listing is waiting for RentPact&apos;s review and isn&apos;t open to tenants yet.
        </p>
      ) : (
        <div className="rounded-md bg-cream-300 px-4 py-3 text-sm text-ink-muted">
          <p className="font-semibold text-ink">Not yet verified</p>
          <p className="mt-1">
            This listing was published before RentPact started checking properties. Visit the property and ask to see
            the ownership documents before you pay.
          </p>
          {listing.landlordVerified && <VerifiedLandlordBadge className="mt-2" />}
        </div>
      )}
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">Your rent is protected.</span> The landlord receives nothing until the first
        rent period has passed, and you can raise a dispute to freeze the money before then.
      </p>
      <ReportListing listingId={listing.id} />
    </>
  );
}

function ReportListing({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) return <p className="text-sm text-forest-500">Thanks. Our team will look into this listing.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-medium text-terracotta-500 underline">
        Report this listing
      </button>
    );
  }
  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await reportListing(listingId, reason);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink-muted">What&apos;s wrong with this listing?</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="e.g. The landlord asked me to pay outside RentPact, or this house isn't really for rent."
        className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
      />
      {error && <p className="text-xs text-terracotta-500">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={send} disabled={sending || reason.trim().length < 10}>
          {sending ? "Sending…" : "Send report"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function OwnerView({
  listing,
  verification,
  onChanged,
}: {
  listing: Listing;
  verification: ListingVerificationSummary;
  onChanged: () => void;
}) {
  const [me, setMe] = useState<MyVerification | null>(null);
  const [docs, setDocs] = useState<PropertyDocuments>({ titleDocumentType: "", documents: [] });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyVerification().then((r) => setMe(r?.verification ?? null));
  }, []);

  if (verification.status === "approved") {
    return (
      <p className="text-sm text-forest-500">
        Verified{verification.verifiedAt ? ` on ${day(verification.verifiedAt)}` : ""}. Tenants see this listing as verified.
      </p>
    );
  }
  if (verification.status === "pending") {
    return (
      <p className="text-sm text-ink-muted">
        Our team is checking your documents and will contact you to arrange a short video walk-through. Tenants can&apos;t
        see this listing until it&apos;s approved.
      </p>
    );
  }

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await submitListingDocuments(listing.id, docs);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the documents.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {verification.status === "rejected" ? (
        <div className="rounded-md bg-terracotta-50 px-4 py-3 text-sm text-terracotta-500">
          <p className="font-semibold">Changes needed before this listing can go live</p>
          {verification.note && <p className="mt-1">{verification.note}</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Tenants see this listing as &ldquo;Not yet verified&rdquo;. Send its ownership documents to get the verified badge.
        </p>
      )}
      {me === null ? null : me.status !== "approved" ? (
        <Link href="/verify" className="text-sm font-medium text-forest-500 underline">
          First, get verified as a landlord →
        </Link>
      ) : (
        <>
          <PropertyDocumentsForm value={docs} onChange={setDocs} role={me.role} />
          {error && <p className="text-sm text-terracotta-500">{error}</p>}
          <Button onClick={send} disabled={sending || !propertyDocumentsComplete(docs, me.role)}>
            {sending ? "Sending…" : "Send for verification"}
          </Button>
        </>
      )}
    </div>
  );
}
