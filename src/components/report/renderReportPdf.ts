// src/components/report/renderReportPdf.ts
// The ONLY file that touches jsPDF. Takes a fully formatted ReportDocument
// (every cell already a string) and draws it, so this file does no arithmetic
// and no formatting: those live in the tested pure modules under src/lib/report/.
//
// jsPDF is imported dynamically inside the function so its ~350KB never loads
// for the roles that do not have the export button.
//
// Verified against jspdf 4.x + jspdf-autotable 5.x: autoTable(doc, options) is
// both the named and the default export, `showFoot: "lastPage"` prints the Sum
// row once at the very end, and `doc.lastAutoTable.finalY` still reports where
// the previous table ended.

import type { ReportColumn, ReportDocument } from "../../lib/report/document";

const LOGO_URL = "/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png";
const MUTED: [number, number, number] = [107, 114, 128];
const AMBER: [number, number, number] = [180, 83, 9];
const INK: [number, number, number] = [17, 24, 39];
const BRAND: [number, number, number] = [203, 0, 2]; // Miller Storm red

/**
 * jsPDF's built-in fonts are Latin-1 only. Anything outside that range (emoji
 * in a course title, smart quotes pasted from Word) would draw as tofu boxes,
 * so strip it rather than print garbage. Smart punctuation is downgraded to an
 * ASCII equivalent first so words stay readable.
 */
export function toLatin1(s: string): string {
  return String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^ -~ -ÿ]/g, "")
    .trim();
}

const clean = (rows: string[][]) => rows.map((r) => r.map(toLatin1));

function columnStyles(columns: ReportColumn[]) {
  const styles: Record<number, { halign: "left" | "right" }> = {};
  columns.forEach((c, i) => {
    styles[i] = { halign: c.align };
  });
  return styles;
}

const TABLE_BASE = {
  theme: "striped" as const,
  styles: { font: "helvetica", fontSize: 9, cellPadding: 5, overflow: "linebreak" as const },
  headStyles: { fillColor: [241, 245, 249], textColor: [55, 65, 81], fontStyle: "bold" as const },
  alternateRowStyles: { fillColor: [250, 250, 250] },
};

/** Loads the logo as a data URL. Resolves to null on any failure: a missing logo must never block an export. */
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function renderReportPdf(doc: ReportDocument): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = ((autoTableModule as any).default ?? (autoTableModule as any).autoTable) as (
    d: any,
    options: any
  ) => void;

  const pdf = new jsPDF({ orientation: doc.orientation, unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  const logo = await loadLogo();
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", margin, y - 6, 46, 46);
    } catch {
      // A logo that will not decode must never block the report.
    }
  }
  const textLeft = logo ? margin + 58 : margin;
  const textWidth = pageWidth - textLeft - margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(INK[0], INK[1], INK[2]);
  pdf.text(toLatin1(doc.title), textLeft, y + 12);
  y += 26;

  if (doc.note) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(55, 65, 81);
    const noteLines: string[] = pdf.splitTextToSize(toLatin1(doc.note), textWidth);
    pdf.text(noteLines, textLeft, y);
    y += 13 * noteLines.length + 2;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  for (const line of doc.contextLines) {
    const wrapped: string[] = pdf.splitTextToSize(toLatin1(line), textWidth);
    pdf.text(wrapped, textLeft, y);
    y += 12 * wrapped.length;
  }

  if (doc.warning) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(AMBER[0], AMBER[1], AMBER[2]);
    const wrapped: string[] = pdf.splitTextToSize(toLatin1(doc.warning), textWidth);
    pdf.text(wrapped, textLeft, y + 3);
    y += 12 * wrapped.length + 4;
  }

  // Never start the table above the logo's bottom edge.
  y = Math.max(y, margin + 52) + 8;

  autoTable(pdf, {
    ...TABLE_BASE,
    startY: y,
    head: [doc.columns.map((c) => toLatin1(c.label))],
    body: clean(doc.rows),
    // The Sum row is a real table footer, printed once at the very end rather
    // than repeated on every page.
    foot: doc.totals ? [doc.totals.map(toLatin1)] : undefined,
    showFoot: "lastPage",
    footStyles: { fillColor: [241, 245, 249], textColor: [17, 24, 39], fontStyle: "bold" },
    margin: { left: margin, right: margin, bottom: margin + 16 },
    columnStyles: columnStyles(doc.columns),
  });

  for (const section of doc.sections) {
    const prevY = (pdf as any).lastAutoTable?.finalY ?? y;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(INK[0], INK[1], INK[2]);
    pdf.text(toLatin1(section.heading), margin, prevY + 26);
    autoTable(pdf, {
      ...TABLE_BASE,
      startY: prevY + 34,
      head: [section.columns.map((c) => toLatin1(c.label))],
      body: clean(section.rows),
      margin: { left: margin, right: margin, bottom: margin + 16 },
      columnStyles: columnStyles(section.columns),
    });
  }

  // Footer on every page. Deliberately carries NO person's name: the report is
  // about the team, not about who ran it.
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text(
      `Miller Storm · Generated ${toLatin1(doc.generatedOn)} · Page ${p} of ${pageCount}`,
      margin,
      pageHeight - 18
    );
    pdf.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
    pdf.setLineWidth(1.5);
    pdf.line(margin, pageHeight - 30, margin + 40, pageHeight - 30);
  }

  pdf.save(doc.fileName);
}
