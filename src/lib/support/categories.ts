// Support request categories (a.k.a. ticket "reasons"). Single source of truth
// for the dropdown options AND the per-category email routing, so changing who
// gets a category's emails is a one-line edit here. Admins always get every
// ticket in addition to these addresses (handled in the tickets API).
export type SupportCategory = {
  key: string; // stored on the ticket
  label: string; // dropdown + display name
  reason: string; // short description of what it's for
  department: string;
  emails: string[]; // who is notified for this category
};

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    key: "billing",
    label: "Billing",
    reason: "Commission issues",
    department: "Billing",
    emails: ["billing@millerstorm.com", "office@millerstorm.com"],
  },
  {
    key: "draw_request",
    label: "Draw Request",
    reason: "Job draw requests",
    department: "Billing",
    emails: ["billing@millerstorm.com", "office@millerstorm.com"],
  },
  {
    key: "tech",
    label: "Miller Storm Tech",
    reason: "App or Web issues",
    department: "Tech",
    emails: ["youssef@millerstorm.com", "tech@millerstorm.com"],
  },
  {
    key: "msrr_tools",
    label: "MSRR Tools Issue",
    reason: "Issues with tools",
    department: "Ops",
    emails: ["nadine@millerstorm.com"],
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
