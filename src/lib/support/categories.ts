// Support request categories (a.k.a. ticket "reasons"). Single source of truth
// for the dropdown options AND the per-category email routing, so changing who
// gets a category's emails is a one-line edit here. Admins always get every
// ticket in addition to these addresses (handled in the tickets API).
// A predefined field shown for a category (Option 2: pick a reason, its fields
// appear). `key` is what's stored in the ticket's `fields` object.
export type SupportField = {
  key: string;
  label: string;
  type: "text" | "select";
  required?: boolean;
  options?: string[]; // for type "select"
  placeholder?: string;
};

export type SupportCategory = {
  key: string; // stored on the ticket
  label: string; // dropdown + display name
  reason: string; // short description of what it's for
  department: string;
  emails: string[]; // who is notified for this category
  fields: SupportField[]; // predefined fields for this reason
};

const ACCULYNX_JOB: SupportField = {
  key: "acculynxJob",
  label: "Acculynx Job# (if available)",
  type: "text",
  placeholder: "e.g. 12345",
};

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    key: "billing",
    label: "Billing",
    reason: "Commission issues",
    department: "Billing",
    emails: ["billing@millerstorm.com", "office@millerstorm.com"],
    fields: [ACCULYNX_JOB],
  },
  {
    key: "draw_request",
    label: "Draw Request",
    reason: "Job draw requests",
    department: "Billing",
    emails: ["billing@millerstorm.com", "office@millerstorm.com", "naaman@millerstorm.com"],
    fields: [ACCULYNX_JOB, { key: "amount", label: "Amount", type: "text", placeholder: "e.g. $1,200" }],
  },
  {
    key: "tech",
    label: "Miller Storm Tech",
    reason: "App or Web issues",
    department: "Tech",
    emails: ["youssef@millerstorm.com", "tech@millerstorm.com"],
    fields: [],
  },
  {
    key: "msrr_tools",
    label: "MSRR Tools Issue",
    reason: "Issues with tools",
    department: "Ops",
    emails: ["nadine@millerstorm.com"],
    fields: [
      { key: "msrrTool", label: "Which MSRR tool?", type: "select", required: true, options: ["Acculynx", "Rep Card", "Hail Trace"] },
    ],
  },
];

export const SUPPORT_CATEGORY_BY_KEY: Record<string, SupportCategory> = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.key, c])
);

// Legacy ticket types from before categories existed, kept so old tickets still
// render a sensible label in the admin table.
const LEGACY_LABELS: Record<string, string> = {
  bug: "Bug / Issue Fix",
  feature: "Request New Feature",
  other: "Other",
};

export function supportTypeLabel(key: string): string {
  return SUPPORT_CATEGORY_BY_KEY[key]?.label ?? LEGACY_LABELS[key] ?? key;
}

// Readable "Label: value" lines for a ticket's stored field values (email body
// + admin table). Only non-empty values for the ticket's own category.
export function supportFieldLines(type: string, fields?: Record<string, string> | null): string[] {
  const cat = SUPPORT_CATEGORY_BY_KEY[type];
  if (!cat || !fields) return [];
  return cat.fields
    .map((f) => {
      const v = (fields[f.key] ?? "").toString().trim();
      return v ? `${f.label.replace(/\s*\(if available\)/i, "")}: ${v}` : null;
    })
    .filter((x): x is string => !!x);
}
