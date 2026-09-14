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
  sets: { emails: ReadonlySet<string>; phones: ReadonlySet<string>; names: ReadonlySet<string> }
): boolean {
  if (rep.email && sets.emails.has(rep.email)) return true;
  if (rep.phone && sets.phones.has(rep.phone)) return true;
  if (rep.nameKey && sets.names.has(rep.nameKey)) return true;
  return false;
}

// The leaderboard row for the person submitting a request (Draw Request email).
// Matched by their signed-in Miller Storm account first: a row's repUserId is set
// when the rep's account email matches their sales records, which survives an
// account name like "james" that never equals "James Williams". The display name
// is only a fallback, for a rep whose account email does not link.
export function findSubmitterRow<T extends { repUserId: string | null; name: string }>(
  rows: readonly T[],
  who: { userId?: string | null; name?: string }
): T | undefined {
  if (who.userId) {
    const byAccount = rows.find((r) => r.repUserId != null && r.repUserId === who.userId);
    if (byAccount) return byAccount;
  }
  const key = normName(who.name);
  return key ? rows.find((r) => normName(r.name) === key) : undefined;
}
