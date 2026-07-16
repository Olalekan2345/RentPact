import type { SVGProps } from "react";
import type { TenancyCredentialSummary } from "@/lib/leaseData";
import { formatDate } from "@/lib/format";
import { explorerTokenUrl } from "@/lib/chain";
import { tenancyCredentialAddress } from "@/lib/contracts/rentPactEscrow";
import { LogoMark } from "@/components/Logo";

/**
 * The soulbound "Proof of Tenancy" credential, rendered as a keepsake
 * certificate — forest-and-gold to match the app, ornate frame, laurel-wreath
 * house emblem, and a wax-seal medallion. This is the in-app display only;
 * the actual NFT artwork is generated on-chain inside TenancyCredential.sol
 * and is a separate (simpler) SVG baked into the deployed contract.
 *
 * `compact` is a smaller preview used on a counterparty's public profile
 * before they've signed a lease with this tenant — full ornamentation there
 * would compete with everything else on that page.
 */
export function TenancyCredentialCard({
  credential,
  compact = false,
}: {
  credential: TenancyCredentialSummary;
  compact?: boolean;
}) {
  if (compact) return <CompactCredentialCard credential={credential} />;
  return <FullCredentialCard credential={credential} />;
}

function CompactCredentialCard({ credential }: { credential: TenancyCredentialSummary }) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-gold-300 bg-forest-500 p-4 text-cream-50 shadow-gold">
      <div className="flex items-center gap-2">
        <SealBadgeIcon className="h-5 w-5 shrink-0 text-gold-300" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Verified Tenancy</p>
      </div>

      <p className="mt-2 font-serif text-lg text-cream-50">
        {credential.durationDays > 0 ? `${credential.durationDays}-day tenancy completed` : "Tenancy completed"}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gold-300/30 pt-4 text-xs">
        <Stat label="On-time" value={`${credential.onTimePeriods}/${credential.totalPeriods}`} />
        <Stat label="Disputes lost" value={String(credential.disputesLost)} />
        <Stat label="Completed" value={formatDate(new Date(credential.completionDate))} />
      </div>
    </div>
  );
}

function FullCredentialCard({ credential }: { credential: TenancyCredentialSummary }) {
  const uid = credential.tokenId.toString();
  const credentialNumber = `№ ${uid.padStart(6, "0")}`;

  return (
    <div className="relative overflow-hidden rounded-lg bg-forest-500 p-1 shadow-gold">
      <GuillochePattern uid={uid} />
      <div className="relative rounded-[7px] border border-gold-400/60 px-5 py-6 sm:px-7 sm:py-7">
        <CornerOrnament className="absolute left-2 top-2 h-6 w-6 text-gold-400/70" />
        <CornerOrnament className="absolute right-2 top-2 h-6 w-6 -scale-x-100 text-gold-400/70" />
        <CornerOrnament className="absolute bottom-2 left-2 h-6 w-6 -scale-y-100 text-gold-400/70" />
        <CornerOrnament className="absolute bottom-2 right-2 h-6 w-6 -scale-x-100 -scale-y-100 text-gold-400/70" />

        <div className="relative flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <LogoMark size={20} chip />
            <span className="font-serif text-xs font-semibold tracking-[0.3em] text-cream-50">RENTPACT</span>
          </div>

          <h3 className="mt-4 font-serif text-[22px] leading-tight tracking-wide text-gold-300 sm:text-2xl">
            PROOF OF TENANCY
          </h3>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-cream-100/60">Verified Rental Credential</p>

          <div className="relative mt-5 h-28 w-full max-w-[200px]">
            <LaurelWreath className="absolute inset-0 h-full w-full text-gold-400/90" />
            <HouseShieldEmblem className="absolute inset-0 m-auto h-14 w-14 text-gold-300" />
          </div>

          <div className="mt-5 flex w-full items-center gap-2">
            <span className="h-px flex-1 bg-gold-400/35" />
            <span className="h-1.5 w-1.5 rotate-45 bg-gold-400" />
            <span className="h-px flex-1 bg-gold-400/35" />
          </div>

          <dl className="mt-5 w-full text-left text-[13px] sm:text-sm">
            <Row label="Duration" value={`${credential.durationDays} day${credential.durationDays === 1 ? "" : "s"}`} />
            <Row label="Payments" value={`${credential.onTimePeriods} of ${credential.totalPeriods} on time`} />
            <Row label="Disputes lost" value={String(credential.disputesLost)} />
            <Row label="Completed" value={formatDate(new Date(credential.completionDate))} />
            <Row label="Credential №" value={credentialNumber} tag="Soulbound" last />
          </dl>

          <Seal uid={uid} className="mt-6 h-20 w-20 text-gold-400" />

          <div className="mt-5 flex w-full items-center justify-center gap-3 border-t border-gold-400/25 pt-4 text-[9px] uppercase tracking-[0.15em] text-cream-100/55 sm:text-[10px]">
            <span>Secured on Arc</span>
            <span className="text-gold-400/40">·</span>
            <span>Gasless via Circle</span>
          </div>

          {tenancyCredentialAddress && (
            <a
              href={explorerTokenUrl(tenancyCredentialAddress, credential.tokenId)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 text-[11px] text-gold-300 underline"
            >
              View on Arcscan →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tag, last = false }: { label: string; value: string; tag?: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${last ? "" : "border-b border-gold-400/15"}`}>
      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-300/90">{label}</dt>
      <dd className="flex items-center gap-1.5 truncate text-cream-50">
        {value}
        {tag && (
          <span className="flex items-center gap-1 rounded-full border border-gold-400/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gold-300/90">
            <LockIcon className="h-2.5 w-2.5" />
            {tag}
          </span>
        )}
      </dd>
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

function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SealBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5 11L12 5l7 6v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9.5 13.5l1.8 1.8 3.2-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A house line-drawing framed by a shield outline — the certificate's centerpiece, above the laurel wreath. */
function HouseShieldEmblem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="none" {...props}>
      <path
        d="M50 6l28 10v26c0 20-12 34-28 42-16-8-28-22-28-42V16z"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <g stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 46l22-18 22 18" />
        <path d="M33 42v26h34V42" />
        <path d="M43 68V54h14v14" />
        <path d="M39 50h4M57 50h4" />
      </g>
    </svg>
  );
}

const LEAF_ANGLES = [8, 24, 40, 56, 72, 86];

/** Two mirrored branches of laurel leaves curling up from the base — hand-built, not a stock asset. */
function LaurelWreath(props: SVGProps<SVGSVGElement>) {
  const leaf = (angle: number, side: 1 | -1, scale: number) => {
    const rad = (angle * Math.PI) / 180;
    const r = 42;
    const cx = 50 + side * Math.sin(rad) * r;
    const cy = 96 - Math.cos(rad) * r;
    const rotate = side * (90 - angle) * -1 + (side === 1 ? -20 : 20);
    return (
      <ellipse
        key={`${side}-${angle}`}
        cx={cx}
        cy={cy}
        rx={7 * scale}
        ry={3.2 * scale}
        fill="currentColor"
        fillOpacity={0.85}
        transform={`rotate(${rotate} ${cx} ${cy})`}
      />
    );
  };

  return (
    <svg viewBox="0 0 100 100" fill="none" {...props}>
      <path d="M8 96C8 70 20 46 40 30" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
      <path d="M92 96C92 70 80 46 60 30" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
      {/* Leaves taper toward the tip (low angle, near the top) and are fullest at the base (high angle). */}
      {LEAF_ANGLES.map((a, i) => leaf(a, -1, 0.7 + i * 0.06))}
      {LEAF_ANGLES.map((a, i) => leaf(a, 1, 0.7 + i * 0.06))}
    </svg>
  );
}

/** A right-angle key-fret bracket, rotated per corner by the caller. */
function CornerOrnament(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M2 14V2h12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 14V6h8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10h4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="2" width="2.4" height="2.4" fill="currentColor" />
    </svg>
  );
}

/** Circular wax-seal medallion with curved text top and bottom, via SVG textPath. */
function Seal({ uid, ...props }: { uid: string } & SVGProps<SVGSVGElement>) {
  const topId = `credential-seal-top-${uid}`;
  const bottomId = `credential-seal-bottom-${uid}`;
  return (
    <svg viewBox="0 0 100 100" fill="none" {...props}>
      <defs>
        <path id={topId} d="M14 54a36 36 0 0 1 72 0" />
        <path id={bottomId} d="M18 62a32 32 0 0 0 64 0" />
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
      <text fill="currentColor" fontSize="7.5" letterSpacing="2" fontWeight={600}>
        <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
          RENTPACT
        </textPath>
      </text>
      <text fill="currentColor" fontSize="6" letterSpacing="1.5" fontWeight={600} fillOpacity={0.85}>
        <textPath href={`#${bottomId}`} startOffset="50%" textAnchor="middle">
          TRUST · VERIFIED
        </textPath>
      </text>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M38 42l18-14 18 14" />
        <path d="M42 39v18h28V39" />
        <path d="M50 57v-9h8v9" />
      </g>
    </svg>
  );
}

/** A faint tiled arc pattern behind the frame — a light nod to certificate guilloché texture without the full engraving complexity. */
function GuillochePattern({ uid }: { uid: string }) {
  const patternId = `credential-guilloche-${uid}`;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M0 13a13 13 0 0 1 13-13" stroke="#D4A017" strokeWidth="1" fill="none" />
          <path d="M13 26a13 13 0 0 1 13-13" stroke="#D4A017" strokeWidth="1" fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
