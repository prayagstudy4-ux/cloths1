/**
 * gen-icons.ts — generates PWA icons from public/logo.svg using sharp.
 *
 * Rasterizes the SVG into the PNG sizes required by the Web App Manifest
 * (Android) and iOS (apple-touch-icon). Run with: bun run scripts/gen-icons.ts
 *
 * Icons are composited onto a white background so they render cleanly on any
 * home-screen wallpaper (iOS renders transparent PNG areas as black).
 */
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const pub = resolve(process.cwd(), "public");
const svgPath = resolve(pub, "logo.svg");

if (!existsSync(svgPath)) {
  console.error("✗ public/logo.svg not found");
  process.exit(1);
}

const svg = readFileSync(svgPath);

// [size, filename, manifest purpose]
const icons: [number, string, "any" | "maskable" | "apple"][] = [
  [192, "logo-192.png", "any"],
  [512, "logo-512.png", "any"],
  [180, "apple-touch-icon.png", "apple"],
];

async function main() {
  for (const [size, name, purpose] of icons) {
    await sharp(svg)
      .resize(size, size, { fit: "contain" })
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(resolve(pub, name));
    console.log(`✓ generated ${name} (${size}x${size}) [${purpose}]`);
  }
  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
