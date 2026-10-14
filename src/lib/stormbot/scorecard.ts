// Storm Bot's nightly SCORECARD, modelled on Naaman's hand-written close-out.
// PURE ONLY: no database, no I/O, no env reads. nightly-scorecard.ts gathers the
// facts; this file decides the words. No AI by Youssef's choice (2026-10-14):
// phrases rotate deterministically so tests assert exact strings.
// Colons, commas and parentheses only: never em dashes (app-wide copy rule).
import { mentionTag, pickCloser, formatAmount } from "./copy";
import { centralParts, centralWallToUtc } from "../acculynx/windows";

export interface ScorecardWin { userId: string; name: string; metric: "filed" | "won"; amount: number }
export interface ScorecardKnocker { userId: string; name: string; knocks: number }
export interface Scorecard { text: string; mentionIds: string[] }

export const SCORECARD_HOUR = 22; // 10 PM Central

export const SCORECARD_HYPE = ["Let's go!", "BIGGUN!", "Way to get it done!", "Consistent!", "That's how it's done!", "Keep stacking!"];
export const SCORECARD_SIGNOFFS = ["Way to close it out, team! ⚡️", "Rest up and run it back tomorrow! 💪", "Proud of this crew! 🙌", "That's a wrap on today! 🔥"];

// 22:00 Central yesterday to 22:00 Central today. Both ends are computed as
// Central wall-clock times, NOT end minus 24h, so a DST night is 23 or 25 hours
// long and no win falls between two scorecards or lands in both.
export function scorecardWindow(now: Date): { start: Date; end: Date; date: string } {
  const { year, month, day } = centralParts(now);
  const end = centralWallToUtc(year, month, day, SCORECARD_HOUR);
  // Yesterday's Central date: step back from noon UTC to avoid the boundary.
  const y = centralParts(new Date(Date.UTC(year, month - 1, day, 12) - 86400000));
  const start = centralWallToUtc(y.year, y.month, y.day, SCORECARD_HOUR);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { start, end, date };
}

export function scorecardDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // Noon UTC is the same calendar day in Central, so formatting in UTC is safe.
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
}

interface RepTally { userId: string; name: string; claims: number; contracts: number; dollars: number }

function repLine(r: RepTally, date: string): string {
  const parts: string[] = [];
  if (r.contracts === 1) parts.push(r.dollars > 0 ? `SIGNED a ${formatAmount(r.dollars)} contract` : "SIGNED a contract");
  else if (r.contracts > 1) parts.push(r.dollars > 0 ? `SIGNED ${r.contracts} contracts (${formatAmount(r.dollars)})` : `SIGNED ${r.contracts} contracts`);
  if (r.claims === 1) parts.push("FILED a claim");
  else if (r.claims > 1) parts.push(`FILED ${r.claims} claims`);
  const emoji = r.contracts > 0 && r.claims > 0 ? "💰" : r.contracts > 0 ? "🔒" : "💪";
  const hype = pickCloser(SCORECARD_HYPE, `${date}:${r.userId}`);
  return `${mentionTag(r.name)} ${parts.join(" and ")}! ${emoji} ${hype}`;
}

export function buildScorecard(input: { date: string; wins: ScorecardWin[]; knockers: ScorecardKnocker[] }): Scorecard | null {
  const { date } = input;
  const tallies = new Map<string, RepTally>();
  for (const win of input.wins) {
    const name = (win.name || "").trim();
    if (!name) continue; // nothing to print or tag
    const t = tallies.get(win.userId) || { userId: win.userId, name, claims: 0, contracts: 0, dollars: 0 };
    if (win.metric === "filed") t.claims += 1;
    else { t.contracts += 1; if (win.amount > 0) t.dollars += win.amount; }
    tallies.set(win.userId, t);
  }
  if (tallies.size === 0) return null; // quiet day: no post (Youssef, 2026-10-14)

  const byName = (a: RepTally, b: RepTally) => a.name.localeCompare(b.name);
  const reps = [...tallies.values()];
  const contractReps = reps.filter((r) => r.contracts > 0)
    .sort((a, b) => b.dollars - a.dollars || b.contracts - a.contracts || byName(a, b));
  const claimReps = reps.filter((r) => r.contracts === 0)
    .sort((a, b) => b.claims - a.claims || byName(a, b));

  const mentionIds: string[] = [];
  const mention = (id: string) => { if (!mentionIds.includes(id)) mentionIds.push(id); };

  const blocks: string[] = [`SCORECARD 🗣️ ${scorecardDateLabel(date)}`];
  for (const r of [...contractReps, ...claimReps]) { blocks.push(repLine(r, date)); mention(r.userId); }

  const top = input.knockers
    .filter((k) => k.knocks > 0 && (k.name || "").trim())
    .sort((a, b) => b.knocks - a.knocks || a.name.trim().localeCompare(b.name.trim()))
    .slice(0, 3);
  if (top.length > 0) {
    blocks.push(`Top knockers today 🚪\n${top.map((k) => `${mentionTag(k.name)} ${k.knocks}`).join(" · ")}`);
    top.forEach((k) => mention(k.userId));
  }

  blocks.push(pickCloser(SCORECARD_SIGNOFFS, date));
  return { text: blocks.join("\n\n") + "\n", mentionIds };
}
