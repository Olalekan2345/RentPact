"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, CardContent, Input, SegmentedControl, Skeleton } from "@/components/ui";
import { DocumentUpload, documentOf, setDocument } from "@/components/verification/DocumentUpload";
import { ShieldCheckIcon } from "@/components/verification/VerificationBadge";
import { fetchMyVerification, submitLandlordApplication, type MyVerification } from "@/lib/verification";
import { DOCUMENT_RETENTION_DAYS, ID_TYPES, type LandlordRole, type VerificationDocument } from "@/lib/verificationModel";

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/**
 * "Get verified" — the landlord side of RentPact's anti-scam check. Shows exactly which documents a Lagos
 * landlord needs (so they can prepare before applying), the application form, and where their application is.
 */
export default function VerifyPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [verification, setVerification] = useState<MyVerification | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchMyVerification().then((r) => setVerification(r?.verification ?? null));
  }, [session]);

  if (isLoading || !session) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="text-3xl text-ink">Get verified as a landlord</h1>
      <p className="mt-1 text-ink-muted">
        Only verified landlords can list properties on RentPact. It keeps fake landlords out, and tenants trust a
        verified listing.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {verification === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Status verification={verification} onSubmitted={setVerification} />
        )}
        <Requirements />
      </div>
    </div>
  );
}

function Status({
  verification,
  onSubmitted,
}: {
  verification: MyVerification | null;
  onSubmitted: (v: MyVerification) => void;
}) {
  const status = verification?.status ?? "none";

  if (status === "approved") {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <p className="flex items-center gap-2 text-lg font-semibold text-forest-500">
            <ShieldCheckIcon className="h-6 w-6" aria-hidden />
            You&apos;re a verified landlord
          </p>
          {verification?.reviewedAt && <p className="text-sm text-ink-muted">Verified on {day(verification.reviewedAt)}.</p>}
          <p className="text-sm text-ink-muted">
            Each property you list still needs its own ownership documents and a short video walk-through before tenants
            can see it.
          </p>
          <Link href="/listings/new">
            <Button>List a property</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (status === "pending") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <p className="text-lg font-semibold text-ink">We&apos;re reviewing your application</p>
          {verification?.submittedAt && <p className="text-sm text-ink-muted">Sent on {day(verification.submittedAt)}.</p>}
          <p className="text-sm text-ink-muted">
            Our team will call you on the number you gave us to arrange a short video call. We&apos;ll notify you as soon
            as there&apos;s a decision.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === "revoked") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <p className="text-lg font-semibold text-terracotta-500">Your verification was revoked</p>
          {verification?.note && <p className="text-sm text-ink-muted">{verification.note}</p>}
          <p className="text-sm text-ink-muted">
            Your listings have been taken down. If you think this is a mistake,{" "}
            <Link href="/contact" className="text-forest-500 underline">
              contact us
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {status === "rejected" && (
        <div className="rounded-lg border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-sm text-terracotta-500">
          <p className="font-semibold">Your application needs another look</p>
          {verification?.note && <p className="mt-1">{verification.note}</p>}
          <p className="mt-1">Fix the issue below and send it again.</p>
        </div>
      )}
      <ApplicationForm onSubmitted={onSubmitted} />
    </>
  );
}

function ApplicationForm({ onSubmitted }: { onSubmitted: (v: MyVerification) => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<LandlordRole>("owner");
  const [idType, setIdType] = useState<string>(ID_TYPES[0].value);
  const [lasreraNumber, setLasreraNumber] = useState("");
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete =
    fullName.trim().length >= 3 &&
    phone.replace(/\D/g, "").length >= 10 &&
    Boolean(documentOf(documents, "id")) &&
    (role === "owner" || (lasreraNumber.trim() && documentOf(documents, "lasrera"))) &&
    consent;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onSubmitted(
        await submitLandlordApplication({
          fullName,
          phone,
          role,
          idType,
          lasreraNumber,
          documents: role === "owner" ? documents.filter((d) => d.kind !== "lasrera") : documents,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your application.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-ink">Your application</h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">I am</span>
            <SegmentedControl
              options={[
                { value: "owner", label: "The owner" },
                { value: "agent", label: "An agent or caretaker" },
              ]}
              value={role}
              onChange={setRole}
            />
          </div>
          <Input label="Full name (as on your ID)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input
            label="Phone number"
            hint="We'll call you here for a short video call."
            inputMode="tel"
            placeholder="0803 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-muted">ID type</label>
            <select
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
              className="h-11 rounded-md border border-forest-100 bg-cream-50 px-4 text-[15px] text-ink"
            >
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <DocumentUpload
            kind="id"
            label="Photo or scan of your ID"
            hint="The whole card, with your photo and name clearly readable."
            value={documentOf(documents, "id")}
            onChange={(doc) => setDocuments((d) => setDocument(d, "id", doc))}
          />
          {role === "agent" && (
            <>
              <Input
                label="LASRERA registration number"
                hint="Estate agents and caretakers in Lagos must be registered with LASRERA."
                value={lasreraNumber}
                onChange={(e) => setLasreraNumber(e.target.value)}
              />
              <DocumentUpload
                kind="lasrera"
                label="LASRERA registration certificate"
                value={documentOf(documents, "lasrera")}
                onChange={(doc) => setDocuments((d) => setDocument(d, "lasrera", doc))}
              />
            </>
          )}
          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-forest-200"
            />
            <span>
              I agree that RentPact&apos;s review team may check these documents to verify me. They&apos;re stored
              privately, never shown to tenants, and deleted {DOCUMENT_RETENTION_DAYS} days after a decision, in line with
              the Nigeria Data Protection Act 2023.
            </span>
          </label>
          {error && <p className="text-sm text-terracotta-500">{error}</p>}
          <Button type="submit" size="lg" disabled={!complete || submitting}>
            {submitting ? "Sending…" : "Send application"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Requirements() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <h2 className="text-lg font-semibold text-ink">What you&apos;ll need</h2>
        <div>
          <p className="text-sm font-semibold text-ink">About you (once)</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-muted">
            <li>A government ID: NIN slip or card, international passport, driver&apos;s licence, or permanent voter&apos;s card.</li>
            <li>A phone number for a short video call with our team.</li>
            <li>Agents and caretakers: your LASRERA registration number and certificate.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">For every property you list</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-muted">
            <li>
              One title document in the owner&apos;s name: a Certificate of Occupancy (C of O), Governor&apos;s Consent, or
              a registered Deed of Assignment.
            </li>
            <li>A recent Land Use Charge notice or electricity bill for that exact address.</li>
            <li>Agents and caretakers: a letter of authority signed by the owner named on the title document.</li>
            <li>A short live video walk-through of the property with our team.</li>
          </ul>
        </div>
        <p className="rounded-md bg-gold-50 px-4 py-3 text-xs text-gold-700">
          Forged title documents are common in Lagos, so we match the names across all your documents and may search the
          Lands Registry for high-value properties. Never pay or ask for rent outside RentPact&apos;s escrow.
        </p>
      </CardContent>
    </Card>
  );
}
