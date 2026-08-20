import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Stops the design tokens rotting.
 *
 * RULE 1 (zero tolerance): none of the eight tokenized colours may appear as a
 *   raw literal. There is a token for every one of them.
 * RULE 2 (ratchet): every OTHER raw colour is frozen at its current count. The
 *   remaining ~146 colours are not tokenized yet, so they cannot be banned; but
 *   the total may only go DOWN. This stops a 156th colour being invented without
 *   needing a 146-entry allowlist that nobody would maintain.
 */

const ROOTS = ["src", "pages"];
const EXTS = [".tsx", ".ts", ".jsx", ".css"];

// Exempt from BOTH rules. Reasons matter; do not trim them.
// Everything below tokens.css builds HTML THAT LEAVES THE BROWSER. CSS custom
// properties do not work in email: Outlook renders via Word, Gmail strips :root.
// Note two of these live under pages/api/, not src/lib/ — the rule is about what
// the file PRODUCES, not where it sits. Check that before adding a new exemption.
const EXEMPT_FILES = [
  "src/tokens.css",                  // the definitions themselves
  "src/lib/emailTemplates.ts",
  "src/lib/emailTemplatesServer.ts",
  "pages/api/training-timer.ts",                     // 14 hex, emailed via Resend
  "pages/api/playlist-assignments/weekly-digest.ts", // 10 hex, manager digest cron
  // This file's own BANNED / BANNED_RGB dictionaries are string keys like
  // "#F3F4F6" and "107,114,128" — the regexes below would match themselves
  // as offences if this file scanned its own source. Same category as
  // tokens.css: it's the definition, not a use.
  "src/lib/design/tokens.guard.test.ts",
];

// Exempt by PATTERN, not by file: stroke="var(--white)" resolves to nothing and
// renders BLACK. SocialMediaCharts.tsx has 16 colour hits and only 2 are attributes,
// so exempting the whole file would hide 14 legitimate conversions.
const SVG_ATTR = /(?:stroke|fill|stop-color|stopColor)\s*=\s*"#[0-9a-fA-F]{3,6}"/g;

// Exempt by PATTERN, not by file: HTML string `style="..."` attributes (as opposed
// to JSX `style={{}}` objects) get assigned to innerHTML and PERSISTED TO MONGODB
// (e.g. CourseManagement.tsx's rich-text course editor), then rendered by the
// Flutter mobile app, which cannot resolve CSS custom properties var(--x-rgb).
// A raw colour there is correct and required, not a violation. CourseManagement.tsx
// also has ~61 legitimate JSX style={{}} token conversions that must stay guarded,
// so this must be scoped to the attribute pattern, not the whole file — the same
// reasoning as the SVG exemption above.
//
// Also covers inline event-handler attributes (onmouseover="this.style.background=
// 'rgba(...)'" etc.) for the identical reason: those hover-state colours live in the
// same persisted HTML string as the style attribute right next to them, just spelled
// as JS inside an on* attribute instead of a CSS declaration. Verified this pattern
// (style= or on*=) appears in exactly one file repo-wide (CourseManagement.tsx), so
// broadening it does not hide a violation anywhere else.
// The \b word boundary on both alternatives stops this from matching mid-identifier.
// Unanchored, on[a-zA-Z]+=" also matches the "on...=" tail hiding inside content="...",
// contenteditable="..." and fontSize="...", stripping those attributes too even though
// they are not style/event-handler attributes and were never meant to be exempt.
const HTML_STYLE_ATTR = /(?:\bstyle|\bon[a-zA-Z]+)="[^"]*"/g;

const BANNED: Record<string, string> = {
  "#F3F4F6": "var(--surface-subtle) or var(--border-subtle)",
  "#E5E7EB": "var(--border-default) or var(--surface-muted)",
  "#9CA3AF": "var(--text-subtle)",
  "#6B7280": "var(--text-muted)",
  "#374151": "var(--text-tertiary)",
  "#1F2937": "var(--text-secondary), var(--surface-inverse-raised) or var(--border-strong)",
  "#111827": "var(--text-primary) or var(--surface-inverse)",
  "#FFFFFF": "var(--surface-default) or var(--text-inverse)",
};
const BANNED_RGB: Record<string, string> = {
  "243,244,246": "rgb(var(--gray-100-rgb) / <alpha>)",
  "107,114,128": "rgb(var(--gray-500-rgb) / <alpha>)",
  "31,41,55":    "rgb(var(--gray-800-rgb) / <alpha>)",
  "17,24,39":    "rgb(var(--gray-900-rgb) / <alpha>)",
  "255,255,255": "rgb(var(--white-rgb) / <alpha>)",
};

// Exempt by EXACT LOCATION, not by file or pattern: these are individually
// reviewed leave-alone decisions from Tasks 5, 6, 10 and 11 (see
// task-4-6-report.md and task-10-12-report.md), not gaps. Every one of these
// files ALSO carries legitimate token conversions on other lines that must
// stay guarded, so — same reasoning as the SVG/HTML-attribute exemptions
// above — this cannot be a file-level exemption. Verified line-by-line
// against the two task reports; the 54-raw-hex reconciliation there
// (16 Tasks-5/6 + 13 Task-10 + 3 Task-11 + 24 Step-0 email files = 54) is the
// source of truth this list transcribes. Do not add a new entry here without
// the same kind of documented review — this list is a record of decisions
// already made, not a place to quietly wave through a new one.
// Lines carrying an inline `tokens-guard-ignore:` marker are skipped by RULE 1.
// Rule 2's ratchet still counts them: a marker says "this colour is legitimately
// raw HERE", not "this colour stopped existing", and the ratchet's job is to stop
// new colours being invented.
//
// This replaces a LEAVE_ALONE set that keyed exemptions by "file:line". That
// list drifted every time anyone inserted code above an exempted line: the
// approval silently slid onto an unrelated line while the colour it was meant
// to excuse became an "offence", turning this test red for no real reason. It
// was re-anchored by hand at least twice (2026-08, 2026-08-15) and had drifted
// again by 2026-08-20 -- by which point 9 of LeaderboardBoard's 9 approvals
// pointed at table markup. A red guard guards nothing, so ~26 genuine
// violations then accumulated behind the noise unnoticed.
//
// A marker written ON the line cannot separate from the code it describes.
// Keep the inline reason SHORT; the categories that justify a marker at all are
// documented here, once:
//
//   persisted-value   The colour is written to MongoDB, or compared as a string
//                     (e.g. AiBotBuilder's COLOR_THEMES -> bot.colorTheme, and
//                     the `c === "#ffffff"` swatch check). A var() would be
//                     stored verbatim, break the equality, and render as nothing
//                     in the Flutter app, which cannot resolve CSS variables.
//   js-identifier     Bound to a JS identifier or an object-literal colour map
//                     rather than a CSS declaration, so categorise() cannot tell
//                     whether it lands on a background, text or a border.
//   svg-attr          fill/stroke on an SVG element: var() there resolves to
//                     nothing and renders BLACK.
//   bespoke-dark      Sits on a component's OWN dark palette, not on
//                     var(--surface-*). --white-rgb re-points to rgb(23 24 27)
//                     in dark mode, calibrated to blend with --surface-default;
//                     over a bespoke dark background the accent blends to within
//                     ~1 unit and becomes invisible. Real breakage, not a false
//                     positive.
//   fixed-brand       Sits on a hardcoded brand red/gold treatment that is shown
//                     identically in both themes, so a theme-flipping token
//                     would collapse the accent into its own background.
//   theme-invariant   An unconditional rule needing one value in BOTH themes,
//                     where the candidate token re-points in dark mode.
//
// Before adding a marker, check the colour is not simply convertible. The
// default is to convert.
const GUARD_IGNORE = /tokens-guard-ignore/;

const RATCHET_BASELINE = 1404; // measured 2026-08-12; may only go DOWN

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".claude") continue;
    const p = join(dir, e.name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXTS.some((x) => p.endsWith(x))) yield p;
  }
}

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const r of ROOTS) for (const f of walk(r)) {
    const rel = f.replace(/\\/g, "/");
    if (!EXEMPT_FILES.some((x) => rel.endsWith(x))) out.push(rel);
  }
  return out;
}

const expand3 = (h: string) => h.length === 4 ? "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
const norm = (h: string) => expand3(h.toLowerCase()).toUpperCase();

describe("design tokens", () => {
  it("never reintroduces a tokenized colour as a raw literal", () => {
    const offences: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8").replace(SVG_ATTR, "").replace(HTML_STYLE_ATTR, "");
      text.split("\n").forEach((line, i) => {
        if (GUARD_IGNORE.test(line)) return;
        for (const m of line.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
          const use = BANNED[norm(m[0])];
          if (use) offences.push(`${file}:${i + 1}  found "${m[0]}"  ->  use ${use}`);
        }
        for (const m of line.matchAll(/rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,/)]/g)) {
          const use = BANNED_RGB[`${+m[1]},${+m[2]},${+m[3]}`];
          if (use) offences.push(`${file}:${i + 1}  found "${m[0]}"  ->  use ${use}`);
        }
      });
    }
    expect(offences, `\nRaw colours found. Use src/tokens.css:\n${offences.join("\n")}\n`).toEqual([]);
  });

  it("does not increase the count of not-yet-tokenized raw colours", () => {
    let count = 0;
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8").replace(SVG_ATTR, "").replace(HTML_STYLE_ATTR, "");
      for (const m of text.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
        if (!BANNED[norm(m[0])]) count++;
      }
    }
    expect(count, `Raw colour count rose to ${count} (baseline ${RATCHET_BASELINE}). ` +
      `Use a token from src/tokens.css, or lower the baseline if you removed colours.`)
      .toBeLessThanOrEqual(RATCHET_BASELINE);
  });
});
