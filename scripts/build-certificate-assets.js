// Regenerates src/lib/certificate/assets.ts from the design folder.
//
// The certificate PDF is rendered server-side, so the fonts and the logo have
// to travel with the code. docs/design/ is gitignored, which means production
// would find nothing there: this script copies those bytes into src/ as data
// URIs, where they are committed like any other source.
//
//   node scripts/build-certificate-assets.js
//
// Run it only when the brand assets change. The output is a generated file and
// is not meant to be hand-edited.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FONTS = path.join(ROOT, "docs/design/2026-08-13-credentials/source/fonts.css");
const MARK = path.join(ROOT, "docs/design/2026-08-07-web-redesign/source/assets/mark-full.txt");
const OUT = path.join(ROOT, "src/lib/certificate/assets.ts");

for (const f of [FONTS, MARK]) {
  if (!fs.existsSync(f)) {
    console.error(`missing source asset: ${f}`);
    console.error("This script needs the (gitignored) docs/design folder present.");
    process.exit(1);
  }
}

const fonts = fs.readFileSync(FONTS, "utf8").trim();
const mark = fs.readFileSync(MARK, "utf8").trim();

const out = [
  "// GENERATED FILE. Do not hand-edit.",
  "//",
  "// The fonts and logo the certificate is drawn with, inlined as data URIs so a",
  "// server-side render needs no network and no filesystem lookup. Regenerate with",
  "// scripts/build-certificate-assets.js when the brand assets change.",
  "//",
  "// This lives in src/ rather than being read from docs/design/ at runtime",
  "// BECAUSE docs/ is gitignored: production would find nothing there.",
  "",
  `export const CERT_FONT_CSS = ${JSON.stringify(fonts)};`,
  "",
  "/** The Miller Storm mark, full colour, transparent. */",
  `export const CERT_MARK_PNG = ${JSON.stringify("data:image/png;base64," + mark)};`,
  "",
].join("\n");

fs.writeFileSync(OUT, out);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(out.length / 1024).toFixed(0)}KB)`);
