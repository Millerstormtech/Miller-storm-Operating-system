// Accounts whose PRIMARY role is sales/sales-team-lead but who are not
// salespeople. Kept version-controlled (like org-chart.ts) so the list is
// reviewable and survives redeploys.
//
// NOTE: branch managers and admins are NOT listed here — they are excluded
// automatically because their primary role isn't a sales role. Only add someone
// here if their primary role genuinely IS "sales"/"sales-team-lead".
// This list should shrink over time, never grow: the right long-term fix is to
// deactivate these accounts in User Management.

export const EXCLUDED_EMAILS: ReadonlySet<string> = new Set([
  // Developer / test accounts (Krupali + related)
  "ishitapatel3456@gmail.com",
  "k81565600@gmail.com",
  "krupalivekariya50@gmail.com",
  "voravivek976@gmail.com",
  "krupalivekariyaetsy@gmail.com",
  "ishitapatelatvisiontech@gmail.com",
  // CEO — does not compete against his own reps
  "jaymiller@millerstorm.com",
  // Shared / department mailboxes
  "management@millerstorm.com",
  "fortworthoffice@millerstorm.com",
  "supplements@millerstorm.com",
  "automations@millerstorm.com",
  "tech@millerstorm.com",
  "shikhar@millerstorm.com",
  // External, not a Miller Storm rep
  "cam@cameron-clayton.com",
]);

/** Is this email on the scrub-list? Case- and whitespace-insensitive. */
export function isExcludedAccount(email?: string | null): boolean {
  if (!email) return false;
  return EXCLUDED_EMAILS.has(email.trim().toLowerCase());
}
