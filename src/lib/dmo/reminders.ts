// src/lib/dmo/reminders.ts
// Who gets which DMO reminder, and what it says. Pure: the cron endpoint
// (pages/api/dmo/reminders-cron.ts) supplies the clock, the people and who has
// sent their form; this decides the messages. Times live in config.ts.
//
// Two reminders go to the person (weekly: Thursday 6 PM and Friday 9 AM;
// monthly: the last day at 6 PM and the 1st at 9 AM). Then, once the form is
// due, their Team Lead and Branch Manager are told who has not sent it
// (Jay: "it tells the team lead, hey, John Smith hasn't done his DMO").
import {
  MONTHLY_MISSING, MONTHLY_REMINDERS, REMINDER_WINDOW_HOURS, WEEKLY_MISSING, WEEKLY_REMINDERS,
} from "./config";
import { addDays, dmoClock, monthName, nextMonth } from "./calendar";
import { centralWallToUtc } from "../acculynx/windows";
import { monthlyFormState, weeklyFormState } from "./view";

export type StageId =
  | (typeof WEEKLY_REMINDERS)[number]["id"]
  | typeof WEEKLY_MISSING.id
  | (typeof MONTHLY_REMINDERS)[number]["id"]
  | typeof MONTHLY_MISSING.id;

export interface Stage {
  id: StageId;
  kind: "weekly" | "monthly";
  /** "self": the person is reminded. "leaders": their Team Lead and Branch Manager are told. */
  audience: "self" | "leaders";
  at: Date;
  /** The weekly form's week (its Saturday) or the monthly form's month ("YYYY-MM"). */
  form: string;
  /** Unique per stage and form, so a reminder is only ever sent once. */
  key: string;
}

export interface Member {
  userId: string;
  name: string;
  role: string;
  team: string;
  branch: string;
}

export interface Message {
  userId: string;
  key: string;
  title: string;
  body: string;
}

const HOUR_MS = 3_600_000;

function instant(day: string, hour: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  return centralWallToUtc(y, m, d, hour);
}

/**
 * The reminders that should go out at `now`: each one from its time until
 * REMINDER_WINDOW_HOURS later. Forms from before the launch never get one.
 */
export function dueStages(now: Date): Stage[] {
  const clock = dmoClock(now);
  const candidates: Stage[] = [];

  // Weekly: the form filled in this week commits to next week.
  for (const s of [...WEEKLY_REMINDERS, WEEKLY_MISSING]) {
    candidates.push({
      id: s.id,
      kind: "weekly",
      audience: s.id === WEEKLY_MISSING.id ? "leaders" : "self",
      at: instant(addDays(clock.weekOf, s.daysIntoWeek), s.hour),
      form: clock.nextWeekOf,
      key: `${s.id}:${clock.nextWeekOf}`,
    });
  }

  // Monthly: this month's stages (the 1st and 2nd) and next month's (opening on the last day).
  for (const month of [clock.month, nextMonth(clock.month)]) {
    for (const s of [...MONTHLY_REMINDERS, MONTHLY_MISSING]) {
      candidates.push({
        id: s.id,
        kind: "monthly",
        audience: s.id === MONTHLY_MISSING.id ? "leaders" : "self",
        at: instant(addDays(`${month}-01`, s.dayOffset), s.hour),
        form: month,
        key: `${s.id}:${month}`,
      });
    }
  }

  return candidates.filter((st) => {
    const since = now.getTime() - st.at.getTime();
    if (since < 0 || since >= REMINDER_WINDOW_HOURS * HOUR_MS) return false;
    // Before launch a form is never due, so nobody is chased for it.
    return st.kind === "weekly"
      ? weeklyFormState(addDays(st.form, -7), now, null) !== "not-open"
      : monthlyFormState(st.form, now, null) !== "not-open";
  });
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cal", "Ana, Ben, Cal and 4 more". */
export function nameList(names: string[], max = 6): string {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= 1) return sorted.join("");
  if (sorted.length <= max) return `${sorted.slice(0, -1).join(", ")} and ${sorted[sorted.length - 1]}`;
  return `${sorted.slice(0, max).join(", ")} and ${sorted.length - max} more`;
}

function selfCopy(stage: Stage): { title: string; body: string } {
  const m = stage.kind === "monthly" ? monthName(stage.form) : "";
  switch (stage.id) {
    case "weekly-open":
      return { title: "Your weekly DMO is open", body: "Send next week's numbers by Friday at 1 PM." };
    case "weekly-last":
      return { title: "Weekly DMO due today at 1 PM", body: "Last reminder: send next week's numbers before your team meeting." };
    case "monthly-open":
      return { title: `Your ${m} DMO is open`, body: `Set your ${m} income goal and numbers before midnight on ${m} 1.` };
    default:
      return { title: `${m} DMO due today`, body: `Last reminder: set your ${m} goal before midnight tonight.` };
  }
}

function leaderCopy(stage: Stage, missing: string[]): { title: string; body: string } {
  const what = stage.kind === "weekly" ? "weekly DMO" : `${monthName(stage.form)} DMO`;
  if (missing.length === 1) {
    return { title: `${missing[0]} hasn't sent their ${what}`, body: `${missing[0]} hasn't sent their ${what} yet.` };
  }
  return { title: `${missing.length} people haven't sent their ${what}`, body: `Not sent yet: ${nameList(missing)}.` };
}

/** The leaders told about `p`: the Team Lead of their team and the Branch Manager of their branch. */
export function leadersOf(p: Member, everyone: Member[]): Member[] {
  return everyone.filter(
    (l) =>
      l.userId !== p.userId &&
      ((p.team && l.role !== "sales" && l.name.trim() === p.team) ||
        (p.branch && l.role === "branch-manager" && l.branch === p.branch))
  );
}

/**
 * The messages for one stage. `sent` holds everyone who has sent that stage's
 * form. A leader is told in one message about everyone they lead who has not.
 */
export function stageMessages(stage: Stage, people: Member[], sent: Set<string>): Message[] {
  const missing = people.filter((p) => !sent.has(p.userId));
  if (stage.audience === "self") {
    return missing.map((p) => ({ userId: p.userId, key: stage.key, ...selfCopy(stage) }));
  }
  const byLeader = new Map<string, string[]>();
  for (const p of missing) {
    for (const l of leadersOf(p, people)) byLeader.set(l.userId, [...(byLeader.get(l.userId) || []), p.name]);
  }
  return [...byLeader].map(([userId, names]) => ({ userId, key: stage.key, ...leaderCopy(stage, names) }));
}
