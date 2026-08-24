/**
 * Builds and downloads an .xlsx earnings workbook: the growth curve and the
 * per-property donut rasterised to PNG and embedded as images at the top, over
 * editable data tables below. ExcelJS resolves to its browser build (its
 * package "browser" field), so this bundles client-side with no node polyfills.
 * Everything here is browser-only (canvas, Image) and is called on user click.
 */

import { formatDate } from "@/lib/format";
import { monthLabel } from "@/lib/earningsBuckets";
import { growthChartSvg, donutChartSvg, type ChartSvg } from "@/lib/earningsChartSvg";

export interface EarningsExcelInput {
  email: string;
  totalCumulative: number;
  monthlySeries: [string, number][];
  donutItems: { id: string; label: string; value: number }[];
  leases: { propertyAddress: string; periodsReleased: number; totalPeriods: number; total: number }[];
  releases: { timestamp: number; property: string; amount: number; txHash: string | null }[];
}

/** Rasterise a chart SVG to a PNG data URL, scaled up for crispness. */
async function svgToPng(chart: ChartSvg, targetWidth: number): Promise<{ dataUrl: string; width: number; height: number }> {
  const scale = 2;
  const height = Math.round((chart.height / chart.width) * targetWidth);
  const blob = new Blob([chart.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.width = chart.width;
    img.height = chart.height;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("chart image failed to load"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = chart.width * scale;
    canvas.height = chart.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.drawImage(img, 0, 0, chart.width, chart.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: targetWidth, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const APPROX_ROW_PX = 20;

export async function exportEarningsExcel(data: EarningsExcelInput): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Earnings", { views: [{ showGridLines: false }] });

  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 10;

  // ── header ──
  ws.mergeCells("A1:E1");
  const title = ws.getCell("A1");
  title.value = "RentPact — Earnings statement";
  title.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF0B3D2E" } };
  ws.getCell("A2").value = data.email;
  ws.getCell("A2").font = { color: { argb: "FF4A4640" } };
  ws.getCell("A3").value = `Generated ${formatDate(new Date(), "long")}`;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF6E6A63" } };

  // ── chart images ──
  let row = 5; // 1-based row where the next block starts
  const placeChart = async (chart: ChartSvg | null, targetWidth: number) => {
    if (!chart) return;
    const { dataUrl, width, height } = await svgToPng(chart, targetWidth);
    const id = wb.addImage({ base64: dataUrl, extension: "png" });
    ws.addImage(id, { tl: { col: 0.15, row: row - 1 }, ext: { width, height } });
    row += Math.ceil(height / APPROX_ROW_PX) + 2;
  };

  await placeChart(growthChartSvg(data.monthlySeries, monthLabel), 560);
  await placeChart(donutChartSvg(data.donutItems), 520);

  // ── per-property table ──
  const forestHeader = (r: ReturnType<typeof ws.getRow>, cols: number) => {
    for (let c = 1; c <= cols; c++) {
      const cell = r.getCell(c);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3D2E" } };
      cell.alignment = { vertical: "middle" };
    }
  };

  ws.getCell(`A${row}`).value = "Per-property breakdown";
  ws.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: "FF0B3D2E" } };
  row += 1;

  const propHead = ws.getRow(row);
  propHead.values = ["Property", "Periods", "Received (USDC)"];
  forestHeader(propHead, 3);
  row += 1;

  for (const l of data.leases) {
    const r = ws.getRow(row);
    r.getCell(1).value = l.propertyAddress;
    r.getCell(2).value = `${l.periodsReleased} / ${l.totalPeriods}`;
    const amt = r.getCell(3);
    amt.value = l.total;
    amt.numFmt = "#,##0.00";
    row += 1;
  }
  const totalRow = ws.getRow(row);
  totalRow.getCell(1).value = "Total";
  totalRow.getCell(1).font = { bold: true };
  const totalAmt = totalRow.getCell(3);
  totalAmt.value = data.totalCumulative;
  totalAmt.numFmt = "#,##0.00";
  totalAmt.font = { bold: true, color: { argb: "FF0B3D2E" } };
  row += 2;

  // ── release ledger ──
  if (data.releases.length > 0) {
    ws.getCell(`A${row}`).value = "Release ledger";
    ws.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: "FF0B3D2E" } };
    row += 1;

    const ledHead = ws.getRow(row);
    ledHead.values = ["Date", "Property", "Amount (USDC)", "Transaction"];
    forestHeader(ledHead, 4);
    row += 1;

    for (const rel of data.releases) {
      const r = ws.getRow(row);
      r.getCell(1).value = formatDate(new Date(rel.timestamp), "long");
      r.getCell(2).value = rel.property;
      const amt = r.getCell(3);
      amt.value = rel.amount;
      amt.numFmt = "#,##0.00";
      r.getCell(4).value = rel.txHash ?? "—";
      r.getCell(4).font = { name: "Consolas", size: 9, color: { argb: "FF6E6A63" } };
      row += 1;
    }
  }

  ws.getCell(`A${row + 1}`).value =
    "All amounts in USDC, settled on the Arc network. Verifiable on-chain via each transaction hash.";
  ws.getCell(`A${row + 1}`).font = { italic: true, size: 9, color: { argb: "FF6E6A63" } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rentpact-earnings.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
