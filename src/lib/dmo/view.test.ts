import { describe, it, expect } from "vitest";
import { dmoClock } from "./calendar";
import { personDmo, groupDmo, sortPeople, formMonthFor, ZERO, type PersonInput } from "./view";

// Wed 2026-10-07 10:00 CDT: day 5 of the week that began Sat 2026-10-03.
const now = new Date("2026-10-07T15:00:00Z");
const clock = dmoClock(now);

function person(over: Partial<PersonInput> = {}): PersonInput {
  return {
    userId: "u1", name: "Rep One", role: "sales", team: "Luke Huber", branch: "Fort Worth",
    firstKnockDay: "2025-01-01",
    week: { ...ZERO }, month: { ...ZERO }, contractDollarsLast90Days: 0,
    thisWeek: null, nextWeek: null, thisMonth: null, formMonth: null,
    ...over,
  };
}

const committed = (weekOf: string, doors: number, extra: object = {}) => ({
  weekOf, doors, claims: 1, contracts: 0, contractDollars: 0, submittedAt: new Date("2026-10-02T15:00:00Z"), ...extra,
});

describe("personDmo", () => {
  it("bars this week's commitment against this week's numbers", () => {
    const p = personDmo(person({ week: { ...ZERO, doors: 60 }, thisWeek: committed("2026-10-03", 140) }), clock, now);
    // day 5 of 7: doors pace 100
    expect(p.thisWeek.bars[0]).toMatchObject({ field: "doors", actual: 60, target: 140, pace: 100, colour: "red" });
    // Jay's minimum on day 5: 100-door pace 71.4, yellow from 50
    expect(p.chip.state).toBe("at-risk");
  });

  it("shows both numbers when a Team Lead changed the commitment", () => {
    const doc = committed("2026-10-10", 150, {
      adjustments: [{ field: "doors", from: 100, to: 150, byUserId: "tl", at: new Date("2026-10-09T20:00:00Z") }],
    });
    const p = personDmo(person({ nextWeek: doc }), clock, now);
    expect(p.weeklyForm.commitment?.original.doors).toBe(100);
    expect(p.weeklyForm.commitment?.commitment.doors).toBe(150);
  });

  it("the weekly form is not open until Thursday and is done once sent", () => {
    expect(personDmo(person(), clock, now).weeklyForm.state).toBe("not-open");
    const fri = new Date("2026-10-09T15:00:00Z");
    expect(personDmo(person(), dmoClock(fri), fri).weeklyForm.state).toBe("due");
    expect(personDmo(person({ nextWeek: committed("2026-10-10", 100) }), dmoClock(fri), fri).weeklyForm.state).toBe("done");
  });

  it("ramp and at-contract reps are exempt from the floor", () => {
    expect(personDmo(person({ firstKnockDay: "2026-09-20" }), clock, now).weeklyForm.floorExempt).toBe(true);
    expect(personDmo(person({ contractDollarsLast90Days: 150_000 }), clock, now).weeklyForm.floorExempt).toBe(true);
    expect(personDmo(person(), clock, now).weeklyForm.floorExempt).toBe(false);
  });
});

describe("formMonthFor", () => {
  it("collects next month's DMO from the last day of this month", () => {
    const lastDay = new Date("2026-10-31T15:00:00Z");
    expect(formMonthFor(dmoClock(lastDay), lastDay)).toBe("2026-11");
    expect(formMonthFor(clock, now)).toBe("2026-10");
  });
});

describe("groupDmo", () => {
  it("adds members up, counts DMOs done, and colours by the minimum chips", () => {
    const fri = new Date("2026-10-09T15:00:00Z");
    const c = dmoClock(fri);
    const a = personDmo(person({ week: { ...ZERO, doors: 120 }, thisWeek: committed("2026-10-03", 140), nextWeek: committed("2026-10-10", 150) }), c, fri);
    const b = personDmo(person({ userId: "u2", name: "Rep Two", week: { ...ZERO, doors: 10 }, thisWeek: committed("2026-10-03", 100) }), c, fri);
    const g = groupDmo("Luke Huber", "Luke Huber", [a, b], c);
    expect(g.thisWeek.commitment.doors).toBe(240);
    expect(g.thisWeek.actual.doors).toBe(130);
    expect(g.nextWeek).toMatchObject({ submitted: 1 });
    expect(g.nextWeek.commitment.doors).toBe(150);
    expect(g.weeklyDone).toBe(1);
    expect(g).toMatchObject({ colour: "red", green: 1, counted: 2 });
    expect(sortPeople([a, b]).map((p) => p.name)).toEqual(["Rep Two", "Rep One"]);
  });
});
