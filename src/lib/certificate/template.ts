// The certificate document, as HTML, ready for a headless browser to print.
//
// Pure: no database, no I/O, no browser. Given a rep and a credential it
// returns a complete standalone page. The renderer (render.ts) is the only
// thing that launches Chromium; keeping the markup here means the wording and
// layout can be tested without one.
//
// The design is the sheet approved on 2026-08-19 (docs/design/2026-08-13-credentials).
// Sizes are in cqw against a container that IS the page, so the proportions are
// identical to the approved artifact rather than a re-drawing of it.

import { CERT_FONT_CSS, CERT_MARK_PNG } from "./assets";

export type CertificateInput = {
  /** The rep's name, exactly as it should be printed. */
  name: string;
  /** The credential's user-facing label, e.g. "Miller Storm Certificate". */
  credential: string;
  /** Course titles making up the credential, in the order they are listed. */
  courses: string[];
  /** Human date, e.g. "19 August 2026". Formatted by the caller. */
  issuedDate: string;
  /** e.g. "MS-CRT-2026-0147". */
  credentialId: string;
  /**
   * Tier 1 only. Jay signs the Miller Storm Certificate and nothing else, which
   * since the word Diploma was retired is the ONLY thing on the page saying
   * which credential outranks the others. Do not add signatures to tier 2 to
   * make it look richer.
   */
  signature?: { name: string; title: string } | null;
  /** Ring text on the seal. Defaults to Miller Storm. */
  sealRing?: string;
};

/** Minimal HTML escape. Rep names are user data and reach this unfiltered. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function certificateHtml(input: CertificateInput): string {
  const {
    name,
    credential,
    courses,
    issuedDate,
    credentialId,
    signature = null,
    sealRing = "Miller Storm",
  } = input;

  const courseItems = courses.map((c) => `<li>${esc(c)}</li>`).join("");

  // The signature block and the seal share the base row. Without a signature
  // the seal keeps its place at the right rather than sliding to the middle,
  // so tier 1 and tier 2 sheets line up when seen side by side.
  const signatureBlock = signature
    ? `<div class="sig">
            <p class="sig-mark">${esc(signature.name)}</p>
            <div class="sig-line"></div>
            <p class="sig-cap"><b>${esc(signature.name)}</b>${esc(signature.title)}</p>
          </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(credential)} - ${esc(name)}</title>
<style>
${CERT_FONT_CSS}

/* The page IS the sheet: 11 by 8.5 landscape, no margin, so the PDF has no
   white border around the design. */
@page { size: 11in 8.5in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

.cert {
  container-type: inline-size;
  width: 11in; height: 8.5in;
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  background: #FCFCFD; color: #191C22;
  font-family: "Archivo", system-ui, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cert * { position: relative; }
.cert-wm {
  position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%);
  width: 62cqw; opacity: .03; pointer-events: none;
}
.band { height: 2.4cqw; background: #22262F; flex: none; }
.band--thin { height: .7cqw; background: #CA0002; }
.inner { flex: 1; display: flex; flex-direction: column; padding: 4.6cqw 6cqw 4cqw; }
.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 3cqw; }
.org {
  font-size: 1.35cqw; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
  color: #6C7280; line-height: 1.5; margin: 0;
}
.org b { display: block; color: #22262F; font-size: 1.55cqw; letter-spacing: .19em; }
.idno {
  font-size: 1.15cqw; letter-spacing: .13em; text-transform: uppercase; color: #8B909B;
  font-variant-numeric: tabular-nums; text-align: right; line-height: 1.6; margin: 0;
}
.presented {
  margin: 5.4cqw 0 1.2cqw; font-size: 1.5cqw; letter-spacing: .26em;
  text-transform: uppercase; color: #8B909B;
}
.name {
  font-family: "Barlow Condensed", Arial Narrow, sans-serif;
  font-weight: 700; font-size: 9.4cqw; line-height: .92; letter-spacing: -.01em;
  text-transform: uppercase; color: #14171D; margin: 0;
}
.rule { height: .42cqw; width: 26cqw; background: #CA0002; margin: 2.1cqw 0 2.4cqw; }
.cite { font-size: 1.72cqw; line-height: 1.5; color: #4A505C; max-width: 52cqw; margin: 0; }
.award {
  font-family: "Barlow Condensed", Arial Narrow, sans-serif;
  font-weight: 700; text-transform: uppercase; font-size: 5.5cqw; line-height: 1;
  color: #CA0002; margin: 1.5cqw 0 0; letter-spacing: .005em;
}
.base { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 4cqw; }
.incl { max-width: 46cqw; }
.incl-h {
  font-size: 1.1cqw; font-weight: 700; letter-spacing: .19em; text-transform: uppercase;
  color: #8B909B; margin: 0 0 1cqw;
}
/* Single column deliberately: the real course titles are long enough that two
   columns wrapped them mid-phrase. Four titles stack comfortably. */
.incl-l { list-style: none; margin: 0; padding: 0; }
.incl-l li {
  font-size: 1.32cqw; line-height: 1.85; color: #3B414C; padding-left: 1.6cqw; white-space: nowrap;
}
.incl-l li::before { content: "\\2713"; position: absolute; left: 0; color: #CA0002; font-size: 1.2cqw; }
.sig { text-align: center; min-width: 22cqw; }
.sig-mark {
  font-family: "Fraunces", Georgia, serif; font-size: 3.4cqw; color: #22262F;
  font-style: italic; line-height: 1; margin: 0 0 .9cqw;
}
.sig-line { height: 1px; background: #B9BDC6; margin: 0 0 .9cqw; }
.sig-cap { font-size: 1.12cqw; letter-spacing: .16em; text-transform: uppercase; color: #6C7280; margin: 0; }
.sig-cap b { display: block; color: #22262F; font-size: 1.24cqw; letter-spacing: .12em; margin-bottom: .25cqw; }

.seal { width: 15cqw; height: 15cqw; flex: none; color: #CA0002; }
.seal svg { width: 100%; height: 100%; display: block; overflow: visible; }
.ring-o { fill: none; stroke: currentColor; stroke-width: 3; }
.ring-i { fill: none; stroke: currentColor; stroke-width: 1; opacity: .55; }
.ring-t {
  font-family: "Archivo", sans-serif; font-size: 15.5px; font-weight: 700;
  letter-spacing: 2.6px; fill: currentColor; text-transform: uppercase;
}
.core {
  font-family: "Barlow Condensed", sans-serif; font-size: 44px; font-weight: 700;
  fill: currentColor; text-anchor: middle; letter-spacing: 1px;
}
.core-sub {
  font-family: "Archivo", sans-serif; font-size: 13px; font-weight: 700;
  fill: currentColor; text-anchor: middle; letter-spacing: 2.4px; opacity: .75;
}
</style>
</head>
<body>
<div class="cert">
  <img class="cert-wm" src="${CERT_MARK_PNG}" alt="" />
  <div class="band"></div>
  <div class="band band--thin"></div>
  <div class="inner">
    <div class="top">
      <p class="org">Awarded by<b>Miller Storm Roofing &amp; Reconstruction</b></p>
      <p class="idno">Issued ${esc(issuedDate)}<br />${esc(credentialId)}</p>
    </div>
    <p class="presented">This certifies that</p>
    <p class="name">${esc(name)}</p>
    <div class="rule"></div>
    <p class="cite">has completed the training below and is hereby awarded the</p>
    <p class="award">${esc(credential)}</p>
    <div class="base">
      <div class="incl">
        <p class="incl-h">Program completed</p>
        <ul class="incl-l">${courseItems}</ul>
      </div>
      ${signatureBlock}
      <div class="seal">
        <svg viewBox="0 0 200 200" role="img" aria-label="${esc(sealRing)} certified seal">
          <defs>
            <path id="arcTop" d="M 100,100 m -80,0 a 80,80 0 1,1 160,0" />
            <path id="arcBot" d="M 100,100 m -80,0 a 80,80 0 1,0 160,0" />
          </defs>
          <circle class="ring-o" cx="100" cy="100" r="94" />
          <circle class="ring-i" cx="100" cy="100" r="66" />
          <text class="ring-t"><textPath href="#arcTop" startOffset="50%" text-anchor="middle">${esc(sealRing)}</textPath></text>
          <text class="ring-t"><textPath href="#arcBot" startOffset="50%" text-anchor="middle">Certified</textPath></text>
          <text class="core" x="100" y="104">${esc(issuedDate.slice(-4))}</text>
          <text class="core-sub" x="100" y="126">CERTIFICATE</text>
        </svg>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

/**
 * The certificate number printed on the sheet and quoted in the email.
 *
 * Deterministic from the rep and the credential rather than a counter, so a
 * reissued certificate carries the SAME number as the original. A counter would
 * hand the same person two different numbers for one achievement, which is
 * exactly what a number on a document is supposed to rule out.
 */
export function credentialNumber(params: {
  userId: string;
  credentialKey: string;
  year: number;
}): string {
  const prefix =
    params.credentialKey === "certificate"
      ? "CRT"
      : params.credentialKey === "knockers"
        ? "MKC"
        : "RHC";
  let h = 0;
  for (const ch of `${params.userId}:${params.credentialKey}`) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `MS-${prefix}-${params.year}-${String(h % 10000).padStart(4, "0")}`;
}
