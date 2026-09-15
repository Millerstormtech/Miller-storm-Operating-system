// src/lib/canvass/facts.test.ts
import { describe, it, expect } from "vitest";
import { homeFacts, knocksForGrade, type StoredDoor } from "./facts";

// A door as stored after the RepCard import, times as UTC timestamps.
const door = (over: Partial<StoredDoor> = {}): StoredDoor => ({
  status: "Not Interested",
  statusAt: "2026-04-02T03:30:04.000Z",
  knocks: [{ at: "2026-04-02T03:30:00.000Z", status: "Not Interested", userId: 502, rep: "Rep Two", verified: true }],
  statusChanges: [],
  ...over,
});

describe("knocksForGrade", () => {
  it("dates each event by its day in Texas, so a 10:30 pm knock stays on that evening", () => {
    expect(knocksForGrade([door()])).toEqual([{ status: "Not Interested", at: "2026-04-01" }]);
  });

  it("puts together the events of every RepCard contact at the house", () => {
    const second = door({
      status: "Visible Damage",
      statusAt: "2026-05-10T18:00:00.000Z",
      knocks: [{ at: "2026-05-10T18:00:00.000Z", status: "Visible Damage", userId: 501, rep: "Rep One", verified: false }],
    });
    expect(knocksForGrade([door(), second])).toEqual([
      { status: "Not Interested", at: "2026-04-01" },
      { status: "Visible Damage", at: "2026-05-10" },
    ]);
  });

  it("returns no knocks for a house no rep has visited", () => {
    expect(knocksForGrade([])).toEqual([]);
  });
});

describe("homeFacts", () => {
  const base = {
    yearBuilt: 1998,
    ownerLivesHere: true,
    hail: [{ date: "2026-05-04", inches: 1.75 }],
    countyFlags: [] as string[],
    doors: [] as StoredDoor[],
    jobs: [] as Array<{ milestone: string }>,
    neighborSignedAt: null,
  };

  it("passes the house's own facts through", () => {
    expect(homeFacts(base)).toEqual({
      yearBuilt: 1998,
      yearBuiltReliable: true,
      ownerLivesHere: true,
      hail: [{ date: "2026-05-04", inches: 1.75 }],
      knocks: [],
      openAccuLynxJob: false,
      neighborSignedAt: null,
    });
  });

  it("does not trust year built in a county flagged for suspicious years (Hockley)", () => {
    expect(homeFacts({ ...base, countyFlags: ["year-built-suspicious"] }).yearBuiltReliable).toBe(false);
  });

  it("marks an AccuLynx job at the house that is not cancelled, Closed included", () => {
    expect(homeFacts({ ...base, jobs: [{ milestone: "Cancelled" }, { milestone: "Closed" }] }).openAccuLynxJob).toBe(true);
  });

  it("ignores cancelled AccuLynx jobs", () => {
    expect(homeFacts({ ...base, jobs: [{ milestone: "Cancelled" }] }).openAccuLynxJob).toBe(false);
  });

  it("brings in the knocks of the doors matched to the house", () => {
    expect(homeFacts({ ...base, doors: [door()] }).knocks).toEqual([{ status: "Not Interested", at: "2026-04-01" }]);
  });
});
