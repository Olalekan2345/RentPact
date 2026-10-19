import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import type { ListingVerificationStatus } from "@/lib/verificationModel";

export function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3.5l7 2.75v5.2c0 4.3-2.95 7.85-7 9.05-4.05-1.2-7-4.75-7-9.05v-5.2L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M8.75 12.1l2.2 2.2 4.3-4.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STYLES: Record<ListingVerificationStatus, { label: string; className: string }> = {
  approved: { label: "Verified", className: "bg-forest-500 text-cream-50" },
  unverified: { label: "Not yet verified", className: "bg-cream-400 text-ink-muted" },
  pending: { label: "Pending review", className: "bg-gold-50 text-gold-600" },
  rejected: { label: "Changes needed", className: "bg-terracotta-50 text-terracotta-500" },
};

/** A listing's verification state as a small pill. */
export function ListingVerificationBadge({
  status,
  className,
}: {
  status: ListingVerificationStatus;
  className?: string;
}) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        s.className,
        className,
      )}
    >
      {status === "approved" && <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden />}
      {s.label}
    </span>
  );
}

/** "Verified landlord" — shown beside a landlord whose identity RentPact has checked. */
export function VerifiedLandlordBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-forest-500", className)}>
      <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden />
      Verified landlord
    </span>
  );
}
