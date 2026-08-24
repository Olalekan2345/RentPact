"use client";

import { motion } from "framer-motion";
import { formatUSDC } from "@/lib/format";

/**
 * Per-property share of total earnings, as a donut with a legend. Turns the
 * flat breakdown list into an at-a-glance split of where the income comes from.
 * Pure SVG, on-brand palette, staggered reveal on mount.
 */

const PALETTE = ["#0B3D2E", "#337357", "#D4A017", "#C4664A", "#669681", "#EFCF77", "#0A4A3F", "#E2A491"];

export function PropertyDonut({ items }: { items: { id: string; label: string; value: number }[] }) {
  const data = items.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total <= 0) return null;

  const size = 200;
  const stroke = 26;
  const r = (size - stroke) / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const gap = data.length > 1 ? C * 0.012 : 0;

  let offset = 0;
  const segments = data.map((d, i) => {
    const frac = d.value / total;
    const len = frac * C;
    const seg = {
      ...d,
      color: PALETTE[i % PALETTE.length],
      dash: Math.max(0, len - gap),
      offset,
      pct: frac * 100,
    };
    offset += len;
    return seg;
  });

  return (
    <div className="rounded-xl border border-forest-100 bg-cream-100 p-4 shadow-card sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Share by property</p>

      <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        <motion.svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-40 w-40 shrink-0"
          role="img"
          aria-label="Earnings share by property"
          initial={{ opacity: 0, scale: 0.9, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E6EDEA" strokeWidth={stroke} />
          {/* segments */}
          {segments.map((s) => (
            <circle
              key={s.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${s.dash.toFixed(2)} ${(C - s.dash).toFixed(2)}`}
              strokeDashoffset={(-s.offset).toFixed(2)}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          {/* center label */}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={22} fontWeight={600} fill="#141414">
            {formatUSDC(total)}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="#6E6A63">
            USDC total
          </text>
        </motion.svg>

        <ul className="w-full min-w-0 flex-1 space-y-2">
          {segments.map((s, i) => (
            <motion.li
              key={s.id}
              className="flex items-center gap-2.5 text-sm"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.05, duration: 0.3 }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
              <span className="shrink-0 font-medium text-ink">{formatUSDC(s.value)}</span>
              <span className="w-10 shrink-0 text-right text-xs text-ink-soft">{s.pct.toFixed(0)}%</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
