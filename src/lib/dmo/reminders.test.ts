import { describe, it, expect } from "vitest";
import { dueStages, stageMessages, leadersOf, nameList, type Member } from "./reminders";
import { weeklyFormState, monthlyFormState } from "./view";

const ids = (now: string) => dueStages(new Date(now)).map((s) => s.key);

describe("DMO reminders: when", () => {
  it("weekly: Thursday 6 PM and Friday 9 AM to the person, Friday 1 PM to their leaders", () => {
    expect(ids("2026-10-15T23:00:00Z")).toEqual(["weekly-open:2026-10-17"]); // Thu 6:00 PM CDT
    expect(ids("2026-10-16T14:05:00Z")).toEqual(["weekly-last:2026-10-17"]); // Fri 9:05 AM
    expect(ids("2026-10-16T18:00:00Z")).toEqual(["weekly-missing:2026-10-17"]); // Fri 1:00 PM
  });

  it("nothing outside the 3-hour window, so a server that was down never sends a stale one", () => {
    expect(ids("2026-10-15T22:59:00Z")).toEqual([]); // Thu 5:59 PM
    expect(ids("2026-10-16T02:00:00Z")).toEqual([]); // Thu 9:00 PM
    expect(ids("2026-10-14T15:00:00Z")).toEqual([]); // a Wednesday
  });

  it("launch week: the first weekly DMO (due Fri Oct 9) is reminded; the one before is not", () => {
    expect(ids("2026-10-08T23:30:00Z")).toEqual(["weekly-open:2026-10-10"]);
    expect(ids("2026-10-02T18:00:00Z")).toEqual([]); // Fri Oct 2, 1 PM: before launch
  });

  it("monthly: last day 6 PM, the 1st 9 AM, leaders on the 2nd 9 AM, across the DST change", () => {
    expect(ids("2026-10-31T23:00:00Z")).toEqual(["monthly-open:2026-11"]); // Sat Oct 31, 6 PM CDT
    expect(ids("2026-11-01T15:00:00Z")).toEqual(["monthly-last:2026-11"]); // Sun Nov 1, 9 AM CST
    expect(ids("2026-11-02T15:00:00Z")).toEqual(["monthly-missing:2026-11"]); // Mon Nov 2, 9 AM CST
  });

  it("October's monthly DMO, from before launch, is never reminded", () => {
    expect(ids("2026-09-30T23:00:00Z")).toEqual([]);
    expect(ids("2026-10-02T14:00:00Z")).toEqual([]);
  });
});

describe("DMO forms before launch", () => {
  it("a missing form from before launch is not-open, never late", () => {
    const now = new Date("2026-10-08T23:00:00Z");
    expect(monthlyFormState("2026-10", now, null)).toBe("not-open");
    expect(weeklyFormState("2026-09-26", now, null)).toBe("not-open"); // committed to Oct 3
    expect(weeklyFormState("2026-10-03", now, null)).toBe("due"); // committed to Oct 10: the first
  });

  it("a form someone did send still counts", () => {
    const now = new Date("2026-10-08T23:00:00Z");
    expect(monthlyFormState("2026-10", now, new Date("2026-10-08T20:00:00Z"))).toBe("late");
  });
});

const people: Member[] = [
  { userId: "bm", name: "Mark Ellis", role: "branch-manager", team: "Mark Ellis", branch: "Austin" },
  { userId: "tl", name: "Ryan Cole", role: "sales-team-lead", team: "Mark Ellis", branch: "Austin" },
  { userId: "a", name: "Ashley Diaz", role: "sales", team: "Ryan Cole", branch: "Austin" },
  { userId: "b", name: "Caleb Stone", role: "sales", team: "Ryan Cole", branch: "Austin" },
  { userId: "c", name: "Nina Torres", role: "sales", team: "Other Lead", branch: "Dallas" },
];

describe("DMO reminders: who", () => {
  const [open] = dueStages(new Date("2026-10-15T23:00:00Z"));
  const [missing] = dueStages(new Date("2026-10-16T18:00:00Z"));

  it("reminds only the people who have not sent it", () => {
    const msgs = stageMessages(open, people, new Set(["a", "bm"]));
    expect(msgs.map((m) => m.userId)).toEqual(["tl", "b", "c"]);
    expect(msgs[0].title).toBe("Your weekly DMO is open");
  });

  it("tells each Team Lead and Branch Manager, once, who on their team or branch has not", () => {
    const msgs = stageMessages(missing, people, new Set(["bm"]));
    const by = Object.fromEntries(msgs.map((m) => [m.userId, m.body]));
    expect(by.tl).toBe("Not sent yet: Ashley Diaz and Caleb Stone.");
    expect(by.bm).toBe("Not sent yet: Ashley Diaz, Caleb Stone and Ryan Cole.");
    expect(Object.keys(by).sort()).toEqual(["bm", "tl"]); // Nina's leaders are not in this list
  });

  it("one missing person reads as a sentence with their name", () => {
    const [msg] = stageMessages(missing, people.slice(0, 3), new Set(["bm", "tl"]));
    expect(msg.title).toBe("Ashley Diaz hasn't sent their weekly DMO");
  });

  it("nobody is told about themselves", () => {
    expect(leadersOf(people[1], people).map((l) => l.userId)).toEqual(["bm"]);
    expect(leadersOf(people[0], people)).toEqual([]);
  });

  it("long lists are cut short", () => {
    expect(nameList(["G", "F", "E", "D", "C", "B", "A", "H"])).toBe("A, B, C, D, E, F and 2 more");
  });
});
