/**
 * Standalone SVG string builders for the earnings charts — used to rasterize
 * the charts into PNGs that get embedded in the Excel export. These mirror the
 * on-screen React components (CumulativeGrowthChart / PropertyDonut) but are
 * self-contained (title + legend baked in) and animation-free, so a single
 * image tells the whole story inside a spreadsheet cell.
 */

const PALETTE = ["#0B3D2E", "#337357", "#D4A017", "#C4664A", "#669681", "#EFCF77", "#0A4A3F", "#E2A491"];
const FONT = "font-family='Segoe UI, Arial, sans-serif'";
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Point = { x: number; y: number };

function smoothPath(pts: Point[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : "";
  const t = 0.16;
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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ChartSvg {
  svg: string;
  width: number;
  height: number;
}

export function growthChartSvg(series: [string, number][], labelFor: (key: string) => string): ChartSvg | null {
  const cum: { label: string; value: number }[] = [];
  let running = 0;
  for (const [key, amount] of series) {
    running += amount;
    cum.push({ label: labelFor(key), value: running });
  }
  const n = cum.length;
  if (n < 2) return null;

  const W = 720;
  const H = 280;
  const padL = 14;
  const padR = 18;
  const padT = 56; // room for the title
  const padB = 34;
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
  const labelIdx = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]));

  const grid = [0.25, 0.5, 0.75, 1]
    .map((r) => {
      const gy = padT + innerH - r * innerH;
      return `<line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" stroke="#0B3D2E" stroke-opacity="0.06" stroke-width="1"/>`;
    })
    .join("");

  const xLabels = labelIdx
    .map(
      (i) =>
        `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" font-size="13" fill="#6E6A63" ${FONT}>${esc(cum[i].label)}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#FFFFFF"/>
    <text x="${padL}" y="30" font-size="15" font-weight="600" fill="#0B3D2E" ${FONT}>Cumulative growth</text>
    <text x="${W - padR}" y="30" text-anchor="end" font-size="15" font-weight="600" fill="#0B3D2E" ${FONT}>${fmt(total)} USDC</text>
    <defs>
      <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#337357" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="#337357" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#ga)"/>
    <path d="${line}" fill="none" stroke="#D4A017" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${end.x.toFixed(2)}" cy="${end.y.toFixed(2)}" r="5.5" fill="#D4A017" stroke="#FFFFFF" stroke-width="2"/>
    ${xLabels}
  </svg>`;
  return { svg, width: W, height: H };
}

export function donutChartSvg(items: { id: string; label: string; value: number }[]): ChartSvg | null {
  const data = items.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total <= 0) return null;

  const rowH = 26;
  const legendTop = 56;
  const W = 620;
  const H = Math.max(240, legendTop + data.length * rowH + 24);
  const stroke = 26;
  const r = 76;
  const cx = 120;
  const cy = H / 2;
  const C = 2 * Math.PI * r;
  const gap = data.length > 1 ? C * 0.012 : 0;

  let offset = 0;
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const len = frac * C;
    const seg = { ...d, color: PALETTE[i % PALETTE.length], dash: Math.max(0, len - gap), offset, pct: frac * 100 };
    offset += len;
    return seg;
  });

  const ring = segs
    .map(
      (s) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${s.dash.toFixed(2)} ${(C - s.dash).toFixed(2)}" stroke-dashoffset="${(-s.offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    )
    .join("");

  const legendX = 250;
  const legend = segs
    .map((s, i) => {
      const yy = legendTop + i * rowH;
      return `
      <rect x="${legendX}" y="${yy - 9}" width="11" height="11" rx="3" fill="${s.color}"/>
      <text x="${legendX + 20}" y="${yy}" font-size="14" fill="#141414" ${FONT}>${esc(s.label.length > 34 ? s.label.slice(0, 33) + "…" : s.label)}</text>
      <text x="${W - 70}" y="${yy}" text-anchor="end" font-size="14" font-weight="500" fill="#141414" ${FONT}>${fmt(s.value)}</text>
      <text x="${W - 8}" y="${yy}" text-anchor="end" font-size="13" fill="#6E6A63" ${FONT}>${s.pct.toFixed(0)}%</text>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#FFFFFF"/>
    <text x="14" y="30" font-size="15" font-weight="600" fill="#0B3D2E" ${FONT}>Share by property</text>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E6EDEA" stroke-width="${stroke}"/>
    ${ring}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="600" fill="#141414" ${FONT}>${fmt(total)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="#6E6A63" ${FONT}>USDC total</text>
    ${legend}
  </svg>`;
  return { svg, width: W, height: H };
}
