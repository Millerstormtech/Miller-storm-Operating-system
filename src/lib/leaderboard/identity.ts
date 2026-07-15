// src/lib/leaderboard/identity.ts
// Pure, import-free identity normalizers shared by the AccuLynx sync, the RepCard
// sync, and the leaderboard merge. Kept free of runtime imports so `node --test`
// can load it directly.

export function normEmail(s?: string): string {
  return (s || "").trim().toLowerCase();
}

export function normName(s?: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Return a 10-digit US phone (country code 1 stripped), or "" if not exactly 10 digits.
export function normPhone(s?: string): string {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? d : "";
}

// True when a rep matches ANY AccuLynx account by the same email -> phone -> name
// cascade used for sales. All inputs are pre-normalized (normEmail/normPhone/normName).
// Empty sets (e.g. before the first AccuLynx sync populates AcculynxUser) -> always
// false, so the caller falls back to its sales-based flag and never mass-flags reps.
export function hasAcculynxAccount(
  rep: { email?: string; phone?: string; nameKey?: string },
  sets: { emails: Set<string>; phones: Set<string>; names: Set<string> }
): boolean {
  if (rep.email && sets.emails.has(rep.email)) return true;
  if (rep.phone && sets.phones.has(rep.phone)) return true;
  if (rep.nameKey && sets.names.has(rep.nameKey)) return true;
  return false;
}
