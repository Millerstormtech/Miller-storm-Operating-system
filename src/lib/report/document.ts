// src/lib/report/document.ts
// The pure core of the leaderboard PDF export: turns board rows plus filter
// state into a fully formatted ReportDocument. Every number is already a string
// by the time it leaves here, so the PDF renderer does no arithmetic and no
// formatting, and a currency or percentage bug can only live in tested code.
//
// PURE ONLY: no React, no fetch, no window, no Date.now(). The caller passes
// today's date in as a YYYY-MM-DD string.

export type ReportColumn = { key: string; label: string; align: "left" | "right" };

/** An extra table printed below the main one, e.g. the "Not started" group. */
export type ReportSection = { heading: string; columns: ReportColumn[]; rows: string[][] };

export type ReportDocument = {
  title: string;
  note: string;
  /** Plain English period/filter summary, one line each. */
  contextLines: string[];
  /** Amber caveat, empty when not applicable. */
  warning: string;
  columns: ReportColumn[];
  rows: string[][];
  /** The "Sum" row, aligned to `columns`, or null when the board has none. */
  totals: string[] | null;
  sections: ReportSection[];
  fileName: string;
  generatedOn: string;
  orientation: "portrait" | "landscape";
};

/**
 * One available column. `always: true` means it is never offered in the picker
 * and never dropped. `optionalByDefault: true` means it is offered but starts
 * unticked.
 */
export type FieldSpec<T> = {
  key: string;
  label: string;
  align: "left" | "right";
  value: (row: T, index: number) => string;
  always?: boolean;
  optionalByDefault?: boolean;
};

/** `cell` returns the total for a column key, or null for columns with no total. */
export type TotalsSpec = { label: string; cell: (key: string) => string | null };

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const fmtMoney = (n: number) => MONEY.format(n ?? 0);
export const fmtInt = (n: number) => String(n ?? 0);
export const fmtPct = (n: number) => `${Math.round(n ?? 0)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-30" -> "30 Jul 2026". Parsed by hand: no Date, no timezone shifts. */
export function formatReportDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  return `${Number(dd)} ${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "report";
}

export function reportFileName(title: string, iso: string): string {
  return `${slugify(title)}-${iso}.pdf`;
}

/** Eight columns of sales data do not fit portrait; a trimmed set does. */
export function orientationFor(columnCount: number): "portrait" | "landscape" {
  return columnCount >= 6 ? "landscape" : "portrait";
}

export function pickableFields<T>(fields: FieldSpec<T>[]): FieldSpec<T>[] {
  return fields.filter((f) => !f.always);
}

export function defaultSelection<T>(fields: FieldSpec<T>[]): string[] {
  return fields.filter((f) => !f.always && !f.optionalByDefault).map((f) => f.key);
}

export function buildDocument<T>(input: {
  title: string;
  note: string;
  contextLines: string[];
  warning?: string;
  fields: FieldSpec<T>[];
  /** Ticked column keys from the dialog. null means "use the defaults". */
  selectedKeys: string[] | null;
  rows: T[];
  totals?: TotalsSpec | null;
  sections?: ReportSection[];
  isoDate: string;
}): ReportDocument {
  const selected = input.selectedKeys ?? defaultSelection(input.fields);
  const chosen = input.fields.filter((f) => f.always || selected.includes(f.key));
  const columns: ReportColumn[] = chosen.map((f) => ({ key: f.key, label: f.label, align: f.align }));
  const rows = input.rows.map((row, i) => chosen.map((f) => f.value(row, i)));

  const totals = input.totals
    ? columns.map((c, i) => (i === 0 ? input.totals!.label : input.totals!.cell(c.key) ?? ""))
    : null;

  return {
    title: input.title,
    note: input.note,
    contextLines: input.contextLines,
    warning: input.warning ?? "",
    columns,
    rows,
    totals,
    sections: input.sections ?? [],
    fileName: reportFileName(input.title, input.isoDate),
    generatedOn: formatReportDate(input.isoDate),
    orientation: orientationFor(columns.length),
  };
}
