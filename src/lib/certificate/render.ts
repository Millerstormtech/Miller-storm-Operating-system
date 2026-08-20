// SERVER ONLY. The one file that launches a browser to turn the certificate
// HTML into a PDF. Everything about what the certificate SAYS lives in
// template.ts, which is pure and tested; this file only prints it.
//
// Puppeteer rather than jsPDF on purpose. The approved design is HTML and CSS
// (container queries, a watermark, an SVG seal, three embedded typefaces).
// Redrawing that in jsPDF's vector primitives would be a second implementation
// of the same document, free to drift from the one everybody signed off.
//
// Chromium is heavy, and that is affordable here only because this runs on a
// rare event: a rep earns each credential once, ever. Do not reach for this on
// anything that fires per page view.

import { certificateHtml, type CertificateInput } from "./template";

/**
 * Render the certificate to PDF bytes.
 *
 * Throws if the browser cannot start or the page cannot render. Callers should
 * treat that as recoverable and still tell the rep they earned the thing: an
 * email with no attachment beats silence. See sendCertificateEmail.
 */
export async function renderCertificatePdf(input: CertificateInput): Promise<Buffer> {
  // Imported lazily so the ~300MB puppeteer/Chromium dependency is not pulled
  // into the bundle for the many routes that never render a certificate.
  const puppeteer = (await import("puppeteer")).default;

  const browser = await puppeteer.launch({
    // The VPS runs as root inside PM2, where Chromium's sandbox will not start.
    // Same flags the other server-side puppeteer callers in this repo use.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    // setContent with a data-URI-only document: no network at all, so no
    // waiting on requests that will never come.
    await page.setContent(certificateHtml(input), { waitUntil: "load" });
    // Fonts are embedded, but layout still has to settle before printing or the
    // condensed display face falls back and every line breaks differently.
    await page.evaluateHandle("document.fonts.ready");

    const pdf = await page.pdf({
      width: "11in",
      height: "8.5in",
      printBackground: true, // without this the sheet prints as white paper
      pageRanges: "1", // a stray second page if anything overflows
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    // Always close: a leaked Chromium survives the request and eventually the
    // box runs out of memory.
    await browser.close().catch(() => {});
  }
}

/** "Fernando Cano - Miller Storm Certificate.pdf", safe as a filename. */
export function certificateFilename(name: string, credential: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9 .-]/g, "").trim() || "Certificate";
  return `${clean(name)} - ${clean(credential)}.pdf`;
}
