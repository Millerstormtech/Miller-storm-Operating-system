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
