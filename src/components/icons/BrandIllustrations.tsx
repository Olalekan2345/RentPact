import type { SVGProps } from "react";

/** Two keys crossing above a doorway — used for signing / handoff moments. */
export function KeysIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 120" fill="none" {...props}>
      <circle cx="60" cy="60" r="58" className="fill-forest-50" />
      <g stroke="#0B3D2E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="42" cy="48" r="10" />
        <path d="M49 55l24 24" />
        <path d="M73 79l7-7M79 85l6-6" />
        <circle cx="78" cy="72" r="10" transform="rotate(180 78 72)" />
        <path d="M71 65L47 41" />
        <path d="M41 35l-7 7M35 29l-6 6" />
      </g>
      <circle cx="42" cy="48" r="3.5" fill="#D4A017" />
      <circle cx="78" cy="72" r="3.5" fill="#D4A017" />
    </svg>
  );
}

/** A house with a shield overlay — used for the escrow-protection step. */
export function HouseShieldIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 120" fill="none" {...props}>
      <circle cx="60" cy="60" r="58" className="fill-forest-50" />
      <g stroke="#0B3D2E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 58L60 32l32 26" />
        <path d="M36 52v34h48V52" />
        <path d="M50 86V66h20v20" />
      </g>
      <g>
        <path
          d="M60 44l14 5v11c0 9-6 15-14 18-8-3-14-9-14-18V49l14-5z"
          fill="#FAF6EF"
          stroke="#D4A017"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M54 60l4.5 4.5L67 55" stroke="#D4A017" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A handshake over a doorway arch — used for the lease-signing step. */
export function HandshakeIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 120" fill="none" {...props}>
      <circle cx="60" cy="60" r="58" className="fill-forest-50" />
      <path
        d="M34 84V56a26 26 0 0152 0v28"
        stroke="#0B3D2E"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g stroke="#0B3D2E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M34 72l12-6 8 4 8-4 12 6" />
        <path d="M46 66l4 6-4 4" />
        <path d="M74 66l-4 6 4 4" />
      </g>
      <circle cx="60" cy="70" r="4" fill="#D4A017" />
    </svg>
  );
}
