#!/usr/bin/env node
/**
 * PROOF A — the acceptance test for the colour token refactor.
 *
 * For every file changed since <baseRef>, extract the ORDERED SEQUENCE of colour
 * values before and after, resolving var() through src/tokens.css. If the refactor
 * is value-preserving, the two sequences are identical.
 *
 * Comparing sequences (rather than pairing diff lines) means the check does not
 * care how lines moved, and it catches a colour being added, dropped, or swapped.
 *
 * Usage: node scripts/verify-token-refactor.mjs [baseRef]   (default: HEAD)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const baseRef = process.argv[2] || "HEAD";
const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// ---------------------------------------------------------------- token table
function loadTokens(cssText) {
  const map = new Map();
  for (const m of cssText.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

/** Repeatedly substitute var(--x) until no var() remains. */
function resolveVars(value, tokens, depth = 0) {
  if (depth > 10) throw new Error(`token cycle while resolving: ${value}`);
  const out = value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g, (whole, name) => {
    if (!tokens.has(name)) throw new Error(`UNDEFINED TOKEN ${name}`);
    return tokens.get(name);
  });
  return out === value ? out : resolveVars(out, tokens, depth + 1);
}

// ---------------------------------------------------------------- normalising
const expand3 = (h) => h.length === 4 ? "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;

/** Canonical form so #fff, #FFFFFF and rgb(255 255 255) compare equal to themselves. */
function canonicalColour(raw) {
  const s = raw.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) return expand3(s).toUpperCase();
  const fn = s.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    const [r, g, b] = parts;
    const a = parts[3] === undefined ? "1" : String(parseFloat(parts[3]));
    return `RGBA(${+r},${+g},${+b},${a})`;
  }
  return s;
}

/**
 * Pull every colour token out of a file, in source order.
 * Matches hex literals, rgb()/rgba() literals, and var(...) references
 * (including rgb(var(--x-rgb) / 0.9), which is matched as a whole rgb() call).
 */
const COLOUR_RE = /rgba?\([^)]*\)|var\(\s*--[a-zA-Z0-9-]+\s*(?:,[^)]*)?\)|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

function colourSequence(text, tokens) {
  const seq = [];
  for (const m of text.matchAll(COLOUR_RE)) {
    let v = m[0];
    if (v.includes("var(")) v = resolveVars(v, tokens);
    seq.push(canonicalColour(v));
  }
  return seq;
}

// ---------------------------------------------------------------------- main
const tokensCss = readFileSync("src/tokens.css", "utf8");
const tokens = loadTokens(tokensCss);

const changed = git(["diff", "--name-only", baseRef, "--", "src", "pages"])
  .split("\n").map((s) => s.trim()).filter(Boolean)
  .filter((f) => /\.(tsx?|jsx?|css)$/.test(f))
  .filter((f) => f !== "src/tokens.css");

if (changed.length === 0) {
  console.log(`No changed files under src/ or pages/ since ${baseRef}. Nothing to verify.`);
  process.exit(0);
}

let failures = 0;
for (const file of changed) {
  let before;
  try {
    before = git(["show", `${baseRef}:${file}`]);
  } catch {
    console.log(`  NEW FILE (no before state), skipping: ${file}`);
    continue;
  }
  if (!existsSync(file)) { console.log(`  DELETED, skipping: ${file}`); continue; }
  const after = readFileSync(file, "utf8");

  let seqBefore, seqAfter;
  try {
    seqBefore = colourSequence(before, tokens);
    seqAfter = colourSequence(after, tokens);
  } catch (err) {
    console.error(`FAIL ${file}\n      ${err.message}`);
    failures++;
    continue;
  }

  if (seqBefore.length !== seqAfter.length) {
    console.error(`FAIL ${file}`);
    console.error(`      colour COUNT changed: ${seqBefore.length} -> ${seqAfter.length}`);
    console.error(`      a token conversion must never add or remove a colour.`);
    failures++;
    continue;
  }
  for (let i = 0; i < seqBefore.length; i++) {
    if (seqBefore[i] !== seqAfter[i]) {
      console.error(`FAIL ${file}`);
      console.error(`      colour #${i + 1} changed: ${seqBefore[i]} -> ${seqAfter[i]}`);
      failures++;
      break;
    }
  }
}

if (failures) {
  console.error(`\nPROOF A FAILED: ${failures} file(s) are not value-identical.`);
  process.exit(1);
}
console.log(`PROOF A PASSED: ${changed.length} changed file(s) are value-identical to ${baseRef}.`);
