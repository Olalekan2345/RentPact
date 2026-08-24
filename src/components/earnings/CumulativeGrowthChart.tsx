"use client";

import { motion } from "framer-motion";
import { formatUSDC } from "@/lib/format";

/**
 * Cumulative earnings as a smooth area curve — the running total climbing over
 * time, the story the per-period bars can't tell. Pure SVG (no chart lib),
 * responsive via viewBox, with a gentle draw-in on mount.
 */

type Point = { x: number; y: number };

/** Catmull-Rom → cubic bézier, for a soft premium curve instead of jagged segments. */
function smoothPath(pts: Point[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const t = 0.16; // tension
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d.push(`C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  return d.join(" ");
}

export function CumulativeGrowthChart({
  series,
  labelFor,
}: {
  series: [string, number][];
  labelFor: (key: string) => string;
}) {
  // Running total at each bucket.
  const cum: { label: string; value: number }[] = [];
  let running = 0;
  for (const [key, amount] of series) {
    running += amount;
    cum.push({ label: labelFor(key), value: running });
  }
  const n = cum.length;
  if (n < 2) return null;

  const W = 720;
  const H = 240;
  const padL = 12;
  const padR = 16;
  const padT = 28;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxV = Math.max(1, ...cum.map((p) => p.value));

  const x = (i: number) => padL + (i / (n - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;

  const pts: Point[] = cum.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = smoothPath(pts);
  const baseY = padT + innerH;
  const area = `${line} L ${pts[n - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`;

  const end = pts[n - 1];
  const total = cum[n - 1].value;

  // Label the first, middle and last buckets only, to keep the axis uncluttered.
  const labelIdx = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]));
  const gridRatios = [0.25, 0.5, 0.75, 1];

  return (
    <div className="rounded-xl border border-forest-100 bg-cream-100 p-4 shadow-card sm:p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Cumulative growth</p>
        <p className="flex items-baseline gap-1 text-sm font-semibold text-forest-500">
          {formatUSDC(total)}
          <span className="text-[11px] font-normal text-ink-soft">USDC</span>
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" style={{ height: "auto" }} role="img" aria-label="Cumulative earnings over time">
        <defs>
          <linearGradient id="growthArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#337357" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#337357" stopOpacity="0" />
          </linearGradient>
          <filter id="growthGlow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* faint gridlines */}
        {gridRatios.map((r) => {
          const gy = padT + innerH - r * innerH;
          return (
            <line
              key={r}
              x1={padL}
              x2={W - padR}
              y1={gy}
              y2={gy}
              stroke="#0B3D2E"
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          );
        })}

        {/* area fill */}
        <motion.path
          d={area}
          fill="url(#growthArea)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />

        {/* soft glow under the line */}
        <path d={line} fill="none" stroke="#D4A017" strokeOpacity={0.35} strokeWidth={5} filter="url(#growthGlow)" />

        {/* the line */}
        <motion.path
          d={line}
          fill="none"
          stroke="#D4A017"
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* endpoint marker */}
        <motion.circle
          cx={end.x}
          cy={end.y}
          r={5}
          fill="#D4A017"
          stroke="#FDFCFA"
          strokeWidth={2}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.35, ease: "backOut" }}
          style={{ transformOrigin: `${end.x}px ${end.y}px` }}
        />

        {/* x labels */}
        {labelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            fontSize={12}
            fill="#6E6A63"
          >
            {cum[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
}
