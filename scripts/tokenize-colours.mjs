#!/usr/bin/env node
/**
 * Property-aware colour codemod. NEVER GUESSES.
 *
 * Usage: node scripts/tokenize-colours.mjs src/styles.css src/components
 *        node scripts/tokenize-colours.mjs --dry src/portals/admin
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const targets = process.argv.slice(2).filter((a) => a !== "--dry");

// Files never touched. Reasons in the plan's "Hard exclusions" table.
const EXCLUDED_FILES = [
  "src/tokens.css",
  "src/lib/emailTemplates.ts",
  "src/lib/emailTemplatesServer.ts",
];

const CANON = {
  "#f3f4f6": "gray-100", "#e5e7eb": "gray-200", "#9ca3af": "gray-400",
  "#6b7280": "gray-500", "#374151": "gray-700", "#1f2937": "gray-800",
  "#111827": "gray-900", "#ffffff": "white",    "#fff": "white",
};

// (category, primitive) -> semantic token. Only COMMON pairs. Anything absent
// is deliberately left for a human: see the plan's rare-cell guidance.
const MAP = {
  text: {
    "gray-900": "--text-primary",  "gray-800": "--text-secondary",
    "gray-700": "--text-tertiary", "gray-500": "--text-muted",
    "gray-400": "--text-subtle",   "white":    "--text-inverse",
  },
  surface: {
    "white":    "--surface-default", "gray-100": "--surface-subtle",
    "gray-200": "--surface-muted",   "gray-900": "--surface-inverse",
    "gray-800": "--surface-inverse-raised",
  },
  border: {
    "gray-200": "--border-default", "gray-100": "--border-subtle",
    "gray-800": "--border-strong",
  },
};

function categorise(prop) {
  const p = prop.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-+/, "");
  if (p === "color" || p === "caret-color" || p === "webkit-text-fill-color") return "text";
  if (p === "background" || p === "background-color") return "surface";
  if (p.startsWith("border") || p.startsWith("outline") || p === "box-shadow") return "border";
  return null;
}

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
// SVG presentation attributes: var() renders black. Skip by PATTERN, not by file.
const SVG_ATTR = /(?:stroke|fill|stop-color|stopColor)\s*=\s*"#[0-9a-fA-F]{3,6}"/g;

function svgAttrRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(SVG_ATTR)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function processFile(file) {
  const original = readFileSync(file, "utf8");
  const svgRanges = svgAttrRanges(original);
  const skipped = [];
  let converted = 0;
  // Line numbers must be computed against `original` at record time — never
  // re-derived from disk afterward. A real (non-dry) run rewrites the file
  // in place before the report prints, and every conversion grows the file
  // (a short hex becomes a longer var(--token)), so slicing the post-write
  // content at a pre-write offset undercounts newlines for any skip that
  // follows a conversion in the same file.
  const lineOf = (idx) => (original.slice(0, idx).match(/\n/g) || []).length + 1;

  const out = original.replace(HEX, (hex, offset) => {
    const key = hex.toLowerCase();
    const primitive = CANON[key];
    if (!primitive) return hex;                       // not one of the eight

    if (svgRanges.some(([a, b]) => offset >= a && offset < b)) {
      skipped.push({ hex, offset, line: lineOf(offset), reason: "SVG presentation attribute (var() renders black)" });
      return hex;
    }

    // Backward scan for the declaring property.
    let start = -1;
    for (const ch of [",", "{", "}", ";", "\n"]) {
      const i = original.lastIndexOf(ch, offset - 1);
      if (i > start) start = i;
    }
    const segment = original.slice(start + 1, offset);
    const m = segment.match(/^\s*['"`]?([A-Za-z][A-Za-z0-9_-]*)['"`]?\s*:/);
    if (!m) {
      skipped.push({ hex, offset, line: lineOf(offset), reason: `no property found (segment: ${JSON.stringify(segment.slice(0, 48))})` });
      return hex;
    }
    const category = categorise(m[1]);
    if (!category) {
      skipped.push({ hex, offset, line: lineOf(offset), reason: `property "${m[1]}" is not text/surface/border` });
      return hex;
    }
    const token = MAP[category][primitive];
    if (!token) {
      skipped.push({ hex, offset, line: lineOf(offset), reason: `rare pair (${primitive} as ${category}) — needs a human decision` });
      return hex;
    }
    converted++;
    return `var(${token})`;
  });

  if (!DRY && out !== original) writeFileSync(file, out, "utf8");
  return { converted, skipped };
}

function* walk(p) {
  const st = statSync(p);
  if (st.isFile()) { yield p; return; }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".claude") continue;
    yield* walk(join(p, e.name));
  }
}

let totalConverted = 0;
const allSkipped = [];
for (const target of targets) {
  for (const file of walk(target)) {
    const rel = file.replace(/\\/g, "/");
    if (!/\.(tsx?|jsx?|css)$/.test(rel)) continue;
    if (EXCLUDED_FILES.some((x) => rel.endsWith(x))) { console.log(`EXCLUDED ${rel}`); continue; }
    const { converted, skipped } = processFile(file);
    if (converted) { totalConverted += converted; console.log(`  ${converted.toString().padStart(4)} converted  ${rel}`); }
    for (const s of skipped) allSkipped.push({ file: rel, ...s });
  }
}

console.log(`\n${DRY ? "[DRY RUN] " : ""}CONVERTED: ${totalConverted}`);
console.log(`SKIPPED (need a human decision): ${allSkipped.length}\n`);
for (const s of allSkipped) {
  console.log(`  ${s.file}:${s.line}  ${s.hex}  — ${s.reason}`);
}
