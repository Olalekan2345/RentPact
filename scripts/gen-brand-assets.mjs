import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public/brand/logo-source.jpg");
const BRAND_DIR = path.join(ROOT, "public/brand");
const APP_DIR = path.join(ROOT, "src/app");

const FOREST_500 = "#0B3D2E";
const CREAM_200 = "#FAF6EF";
const GOLD_400 = "#D4A017";

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

/** Pads the source to a square canvas on a white background, centered. */
async function squareWhite(size) {
  return sharp(SRC)
    .resize(size, size, { fit: "contain", background: "#FFFFFF" })
    .png()
    .toBuffer();
}

/** Same square pad, but converts near-white pixels to transparent. */
async function squareTransparent(size) {
  const padded = await sharp(SRC)
    .resize(size, size, { fit: "contain", background: "#FFFFFF" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = padded;
  const threshold = 238;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Minimal PNG-in-ICO packer — modern browsers/OS support PNG-format ICO entries. */
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * count;
  let offset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const imageBuffers = [];

  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    dirEntries.push(entry);
    imageBuffers.push(buffer);
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

async function main() {
  await ensureDir(BRAND_DIR);

  // In-app general-purpose marks
  const mark512 = await squareTransparent(512);
  await writeFile(path.join(BRAND_DIR, "logo-mark.png"), mark512);

  const mark256White = await squareWhite(256);
  await writeFile(path.join(BRAND_DIR, "logo-mark-white-bg.png"), mark256White);

  // Next.js file-based metadata icons
  const icon512 = await squareWhite(512);
  await writeFile(path.join(APP_DIR, "icon.png"), icon512);

  const appleIcon180 = await squareWhite(180);
  await writeFile(path.join(APP_DIR, "apple-icon.png"), appleIcon180);

  // favicon.ico (16/32/48, PNG-in-ICO)
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map(async (size) => ({ size, buffer: await squareWhite(size) })),
  );
  const ico = buildIco(pngBuffers);
  await writeFile(path.join(APP_DIR, "favicon.ico"), ico);

  // Open Graph share image (1200x630)
  const ogLogo = await sharp(mark512).resize(220, 220).toBuffer();
  const ogLogoBase64 = ogLogo.toString("base64");

  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="${FOREST_500}" />
      <rect x="0" y="0" width="1200" height="630" fill="url(#g)" opacity="0.4" />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0A4A3F" />
          <stop offset="1" stop-color="${FOREST_500}" />
        </linearGradient>
      </defs>
      <circle cx="270" cy="315" r="150" fill="${CREAM_200}" />
      <image x="160" y="205" width="220" height="220" href="data:image/png;base64,${ogLogoBase64}" />
      <text x="470" y="290" font-family="Georgia, 'Times New Roman', serif" font-size="86" fill="${CREAM_200}">RentPact</text>
      <text x="472" y="345" font-family="Arial, sans-serif" font-size="30" fill="${GOLD_400}">USDC rent escrow, built on Arc</text>
      <text x="472" y="390" font-family="Arial, sans-serif" font-size="22" fill="#CCDCD5">Gasless deposits and releases, powered by Circle</text>
    </svg>
  `;

  const ogImage = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(APP_DIR, "opengraph-image.png"), ogImage);

  console.log("Brand assets generated:");
  console.log(" - public/brand/logo-mark.png (transparent, 512)");
  console.log(" - public/brand/logo-mark-white-bg.png (256)");
  console.log(" - src/app/icon.png (512)");
  console.log(" - src/app/apple-icon.png (180)");
  console.log(" - src/app/favicon.ico (16/32/48)");
  console.log(" - src/app/opengraph-image.png (1200x630)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
