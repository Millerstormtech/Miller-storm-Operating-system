// src/lib/canvass/card.test.ts
import { describe, it, expect } from "vitest";
import { CARD_KNOCKS, houseCard, latestKnockDayByHome, type CardDoor, type CardHome, type CardJob } from "./card";

// Times are UTC as RepCard and AccuLynx send them; the card shows Texas days.

const door = (over: Partial<CardDoor> = {}): CardDoor => ({
  homeId: "h1",
  status: "Not Interested",
  statusAt: "2026-04-02T03:30:04.000Z", // 1 Apr in Texas, 2 Apr in UTC
  knocks: [{ at: "2026-04-02T03:30:00.000Z", status: "Not Interested", rep: "Rep Two", verified: true }],
  statusChanges: [],
  ...over,
});

const home = (over: Partial<CardHome> = {}): CardHome => ({
  _id: "h1",
  address: { line: "1402 EXAMPLE DR", city: "FORT WORTH", zip: "76116" },
  ownerName: "Sample Owner",
  yearBuilt: 1998,
  ownerLivesHere: true,
  roofMaterial: "COMP SHINGLES",
  hail: [
    { date: "2025-06-01", inches: 1.25 },
    { date: "2026-05-04", inches: 2 },
  ],
  grade: {
    score: 70,
    color: "green",
    forced: null,
    reasons: [
      { text: "Hail 2 in on 4 May 2026", points: 40 },
      { text: "Built 1998 (28 years old)", points: 20 },
    ],
  },
  gradedOn: "2026-09-17",
  ...over,
});

describe("latestKnockDayByHome", () => {
  it("gives each house the Texas day of its most recent event", () => {
    const doors = [
      door({ homeId: "h1" }),
      door({ homeId: "h2", statusAt: "2026-06-10T15:00:00Z", knocks: [{ at: "2026-06-10T15:00:00Z", status: "Not Home", rep: "Rep One" }] }),
    ];
    expect(latestKnockDayByHome(doors)).toEqual(new Map([["h1", "2026-04-01"], ["h2", "2026-06-10"]]));
  });

  it("keeps the latest when a house has several doors or several events", () => {
    const doors = [
      door({ homeId: "h1", knocks: [{ at: "2026-02-01T15:00:00Z", status: "Not Home", rep: "A" }], statusAt: "2026-02-01T15:00:00Z", status: "Not Home" }),
      door({ homeId: "h1", knocks: [{ at: "2026-07-20T15:00:00Z", status: "Follow Up", rep: "B" }], statusAt: "2026-07-20T15:00:00Z", status: "Follow Up" }),
    ];
    expect(latestKnockDayByHome(doors).get("h1")).toBe("2026-07-20");
  });

  it("accepts Date objects, the form the database hands back", () => {
    const doors = [door({ statusAt: new Date("2026-04-02T03:30:04Z"), knocks: [{ at: new Date("2026-04-02T03:30:00Z"), status: "Not Interested", rep: "R" }] })];
    expect(latestKnockDayByHome(doors).get("h1")).toBe("2026-04-01");
  });

  it("leaves out doors with no house and doors with no dated event", () => {
    const doors = [door({ homeId: null }), door({ homeId: "h9", status: "", statusAt: null, knocks: [], statusChanges: [] })];
    expect(latestKnockDayByHome(doors).size).toBe(0);
  });
});

describe("houseCard", () => {
  it("carries the address, owner name, grade, reasons and hail, newest storm first", () => {
    const card = houseCard(home(), [], []);
    expect(card.id).toBe("h1");
    expect(card.address).toEqual({ line: "1402 EXAMPLE DR", city: "FORT WORTH", zip: "76116" });
    expect(card.ownerName).toBe("Sample Owner"); // shown on purpose, spec A8.5
    expect(card.color).toBe("green");
    expect(card.score).toBe(70);
    expect(card.reasons).toHaveLength(2);
    expect(card.hail.map((h) => h.date)).toEqual(["2026-05-04", "2025-06-01"]);
    expect(card.yearBuilt).toBe(1998);
    expect(card.gradedOn).toBe("2026-09-17");
  });

  it("lists this house's knocks newest first with the rep's name, and only this house's", () => {
    const doors = [
      door({ homeId: "h1", knocks: [{ at: "2026-03-01T16:00:00Z", status: "Not Home", rep: "Rep One" }], statusChanges: [], status: "Not Home", statusAt: "2026-03-01T16:00:00Z" }),
      door({ homeId: "h1" }), // 1 Apr, Not Interested, Rep Two
      door({ homeId: "other", knocks: [{ at: "2026-08-01T16:00:00Z", status: "Signed", rep: "Rep Nine" }], status: "Signed", statusAt: "2026-08-01T16:00:00Z" }),
    ];
    const card = houseCard(home(), doors, []);
    expect(card.knocks).toEqual([
      { day: "2026-04-01", status: "Not Interested", rep: "Rep Two" },
      { day: "2026-03-01", status: "Not Home", rep: "Rep One" },
    ]);
  });

  it("shows at most the last five knocks", () => {
    const knocks = Array.from({ length: 8 }, (_, i) => ({ at: `2026-0${(i % 8) + 1}-10T16:00:00Z`, status: `Visit ${i + 1}`, rep: "R" }));
    const card = houseCard(home(), [door({ knocks, statusChanges: [], status: "", statusAt: null })], []);
    expect(card.knocks).toHaveLength(CARD_KNOCKS);
    expect(card.knocks[0].status).toBe("Visit 8");
  });

  it("lists this house's AccuLynx jobs with their stage and day", () => {
    const jobs: CardJob[] = [
      { homeId: "h1", milestone: "Approved", milestoneAt: new Date("2026-05-20T15:04:05Z") },
      { homeId: "elsewhere", milestone: "Closed", milestoneAt: "2024-01-01T00:00:00Z" },
      { homeId: "h1", milestone: "Cancelled", milestoneAt: null },
    ];
    expect(houseCard(home(), [], jobs).jobs).toEqual([
      { stage: "Approved", day: "2026-05-20" },
      { stage: "Cancelled", day: null },
    ]);
  });

  it("copes with a house that has no grade yet and no address parts", () => {
    const card = houseCard(home({ grade: undefined, address: { line: "", city: "", zip: "" }, hail: [] }), [], []);
    expect(card.color).toBeNull();
    expect(card.score).toBeNull();
    expect(card.reasons).toEqual([]);
    expect(card.hail).toEqual([]);
    expect(card.knocks).toEqual([]);
  });

  it("never carries a phone number or email, and only the fields the card needs", () => {
    const card = houseCard(home(), [door()], []);
    const keys = Object.keys(card).sort();
    expect(keys).toEqual(["address", "color", "forced", "gradedOn", "hail", "id", "jobs", "knocks", "ownerLivesHere", "ownerName", "reasons", "roofMaterial", "score", "yearBuilt"]);
    expect(JSON.stringify(card)).not.toMatch(/phone|email/i);
  });
});
