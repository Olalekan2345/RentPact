"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { PropertyImage } from "@/components/PropertyImage";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { HandshakeIllustration } from "@/components/icons/BrandIllustrations";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { UsdcAmount } from "@/components/UsdcAmount";
import { FREQUENCY_OPTIONS } from "@/lib/contracts/frequency";
import { getLease, leaseStatus, signDeadline, signLease, type Lease } from "@/lib/leaseData";
import { useCautionFeeLabel } from "@/lib/cautionFee";

export default function LeaseInvitePage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [lease, setLease] = useState<Lease | null | undefined>(undefined);
  const [signing, setSigning] = useState(false);
  const [signingLong, setSigningLong] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [acceptedConstitution, setAcceptedConstitution] = useState(false);
  const cautionLabel = useCautionFeeLabel();

  useEffect(() => {
    getLease(id, false).then(setLease);
  }, [id]);

  // The gasless signature round trip (Circle's PIN challenge, then waiting
  // for on-chain confirmation) can run long — this keeps the button from
  // looking frozen by admitting it's still working instead of sitting on a
  // static "Signing…" the whole time.
  useEffect(() => {
    if (!signing) {
      setSigningLong(false);
      return;
    }
    const t = setTimeout(() => setSigningLong(true), 4000);
    return () => clearTimeout(t);
  }, [signing]);

  if (lease === undefined) return null;

  if (lease === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 text-center">
        <p className="text-ink-muted">This lease invite couldn&apos;t be found.</p>
      </div>
    );
  }

  const frequencyLabel = FREQUENCY_OPTIONS.find((f) => f.value === lease.frequency)?.label ?? lease.frequency;
  const total = lease.amountPerPeriod * lease.totalPeriods;
  const alreadySigned = leaseStatus(lease) !== "awaiting-signature";

  const handleSign = async () => {
    if (!session) return;
    setSigning(true);
    setSignError(null);
    try {
      await signLease(lease.id, session.address);
      setSigned(true);
      setTimeout(() => router.push(`/leases/${lease.id}`), 1800);
    } catch (err) {
      console.error("Sign lease failed:", err);
      const message = err instanceof Error ? err.message : "Could not sign this lease. Please try again.";
      setSignError(
        message.includes("155706")
          ? "Circle's secure signing panel didn't respond in time — this is usually a slow connection or an ad blocker interfering with pw-auth.circle.com. Please try again."
          : message,
      );
    } finally {
      setSigning(false);
    }
  };

  return (
      <div className="pb-16">
      {!session && (
        <div className="flex items-center justify-between border-b border-forest-100/60 px-4 py-4 sm:px-8">
          <Link href="/">
            <Logo size={28} wordmarkClassName="text-forest-500" />
          </Link>
          <p className="hidden text-xs font-semibold uppercase tracking-widest text-forest-400 sm:block">
            Built on Arc · Powered by Circle
          </p>
        </div>
      )}
      <div className="relative">
        <PropertyImage
          seed={lease.id}
          propertyType={lease.propertyType}
          overrideUrl={lease.photoUrl}
          alt={lease.propertyAddress}
          className="h-56 w-full sm:h-72"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/40 to-transparent" />
      </div>

      <div className="mx-auto -mt-6 max-w-lg px-4 sm:px-8">
        <Card className="shadow-lifted">
          <CardContent className="pt-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-forest-400">
              You&apos;ve been invited to a lease
            </p>
            <h1 className="mt-1 font-serif text-2xl text-ink">{lease.propertyAddress}</h1>

            <dl className="mt-5 flex flex-col gap-3 border-y border-forest-100 py-5 text-sm">
              <Row label="Tenant" value={lease.tenantEmail} />
              <Row label="Rent per period" value={<UsdcAmount amount={lease.amountPerPeriod} />} />
              <Row label="Frequency" value={frequencyLabel} />
              <Row label="Total periods" value={String(lease.totalPeriods)} />
              {lease.cautionAmount > 0 && (
                <Row
                  label={cautionLabel.term}
                  value={
                    <span className="inline-flex items-center gap-1">
                      <UsdcAmount amount={lease.cautionAmount} /> (refundable)
                    </span>
                  }
                />
              )}
              <Row label="Total escrowed" value={<UsdcAmount amount={total + lease.cautionAmount} />} />
              <Row label="Sign by" value={signDeadline(lease).toLocaleDateString()} />
            </dl>

            <AnimatePresence mode="wait">
              {signed ? (
                <motion.div
                  key="signed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 flex flex-col items-center gap-3 py-6 text-center"
                >
                  <HandshakeIllustration className="h-16 w-16" />
                  <p className="font-medium text-ink">Lease signed</p>
                  <p className="text-sm text-ink-soft">Redirecting to your lease…</p>
                </motion.div>
              ) : alreadySigned ? (
                <motion.p key="already" className="mt-6 text-sm text-ink-muted">
                  This lease has already been signed.
                </motion.p>
              ) : !session ? (
                <motion.div key="auth" className="mt-6 flex flex-col gap-3">
                  <p className="text-sm text-ink-muted">Sign in to review and sign this lease.</p>
                  <GoogleSignInButton next={`/leases/${lease.id}/invite`} />
                </motion.div>
              ) : (
                <motion.div key="sign" className="mt-6 flex flex-col gap-3">
                  <Badge variant="gold" className="w-fit">Gasless signature</Badge>
                  <label className="flex items-start gap-2 text-sm text-ink-muted">
                    <input
                      type="checkbox"
                      checked={acceptedConstitution}
                      onChange={(e) => setAcceptedConstitution(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-forest-200"
                    />
                    I have read and accept the{" "}
                    <Link href="/constitution" target="_blank" className="text-forest-500 underline">
                      RentPact Constitution
                    </Link>
                  </label>
                  {signError && <p className="text-sm text-terracotta-500">{signError}</p>}
                  <Button size="lg" onClick={handleSign} disabled={signing || !acceptedConstitution}>
                    {signing
                      ? signingLong
                        ? "Still confirming on-chain…"
                        : "Signing…"
                      : signError
                        ? "Try again"
                        : "Sign lease"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
      </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
