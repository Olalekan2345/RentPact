import type { SVGProps } from "react";

/** The USD Coin token mark — blue circle, white $ — shown beside every USDC amount for at-a-glance currency recognition. */
export function UsdcIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <text
        x="16"
        y="22.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="18"
        fontWeight="600"
        fill="#FFFFFF"
      >
        $
      </text>
    </svg>
  );
}
