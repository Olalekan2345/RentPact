import type { TenancyCredentialSummary } from "@/lib/leaseData";
import { formatDate } from "@/lib/format";
import { explorerTokenUrl } from "@/lib/chain";
import { tenancyCredentialAddress } from "@/lib/contracts/rentPactEscrow";

/**
 * The premium "Verified Tenancy" card — mirrors the on-chain SVG badge's
 * gold-on-forest treatment so the card looks like the credential it's
 * displaying. `compact` drops the on-chain link and shrinks padding for use
 * on a counterparty's profile before they sign a lease with this tenant.
 */
export function TenancyCredentialCard({
  credential,
  compact = false,
}: {
  credential: TenancyCredentialSummary;
  compact?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border-2 border-gold-300 bg-forest-500 text-cream-50 shadow-gold ${compact ? "p-4" : "p-6"}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-300">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M5 11L12 5l7 6v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"
              stroke="#D4A017"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path d="M9.5 13.5l1.8 1.8 3.2-4" stroke="#D4A017" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Verified Tenancy</p>
      </div>

      <p className={`mt-2 font-serif text-cream-50 ${compact ? "text-lg" : "text-xl"}`}>
        {credential.durationDays > 0 ? `${credential.durationDays}-day tenancy completed` : "Tenancy completed"}
      </p>

      <div className={`mt-4 grid grid-cols-3 gap-3 border-t border-gold-300/30 pt-4 ${compact ? "text-xs" : "text-sm"}`}>
        <Stat label="On-time" value={`${credential.onTimePeriods}/${credential.totalPeriods}`} />
        <Stat label="Disputes lost" value={String(credential.disputesLost)} />
        <Stat label="Completed" value={formatDate(new Date(credential.completionDate))} />
      </div>

      {!compact && tenancyCredentialAddress && (
        <a
          href={explorerTokenUrl(tenancyCredentialAddress, credential.tokenId)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-gold-300 underline"
        >
          View on Arcscan →
        </a>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-cream-50/60">{label}</p>
      <p className="mt-0.5 font-semibold text-cream-50">{value}</p>
    </div>
  );
}
