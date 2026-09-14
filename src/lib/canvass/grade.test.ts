import { describe, it, expect } from "vitest";
import { gradeHome, colorForScore, type HomeFacts } from "./grade";

const TODAY = "2026-09-14";

// A house worth exactly 0 points: built 2020 (too new to score), occupancy
// unknown, no hail, never knocked, not ours. Each test adds only what it is about.
const home = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  yearBuilt: 2020,
  yearBuiltReliable: true,
  ownerLivesHere: null,
  hail: [],
  knocks: [],
  openAccuLynxJob: false,
  neighborSignedAt: null,
  ...over,
});

describe("gradeHome: the worked examples in the spec (A4)", () => {
  it("2 in hail in May, built 1998, owner lives there, never knocked: 70, green", () => {
    const g = gradeHome(home({ hail: [{ date: "2026-05-04", inches: 2 }], yearBuilt: 1998, ownerLivesHere: true }), TODAY);
    expect(g.score).toBe(70);
    expect(g.color).toBe("green");
    expect(g.forced).toBeNull();
  });

  it("1.5 in hail, built 2005, rented: 45, yellow", () => {
    const g = gradeHome(home({ hail: [{ date: "2026-04-10", inches: 1.5 }], yearBuilt: 2005, ownerLivesHere: false }), TODAY);
    expect(g.score).toBe(45);
    expect(g.color).toBe("yellow");
  });

  it("the green house after a Not Interested two weeks ago: 45, yellow", () => {
    const g = gradeHome(
      home({
        hail: [{ date: "2026-05-04", inches: 2 }],
        yearBuilt: 1998,
        ownerLivesHere: true,
        knocks: [{ status: "Not Interested", at: "2026-08-31" }],
      }),
      TODAY,
    );
    expect(g.score).toBe(45);
    expect(g.color).toBe("yellow");
  });

  it("no hail, built 1985, owner lives there: 30, orange", () => {
    const g = gradeHome(home({ yearBuilt: 1985, ownerLivesHere: true }), TODAY);
    expect(g.score).toBe(30);
    expect(g.color).toBe("orange");
  });

  it("1.1 in hail, built 2016, owner lives there: 30, orange", () => {
    const g = gradeHome(home({ hail: [{ date: "2026-06-01", inches: 1.1 }], yearBuilt: 2016, ownerLivesHere: true }), TODAY);
    expect(g.score).toBe(30);
    expect(g.color).toBe("orange");
  });

  it("any house marked Do Not Knock: red, whatever its points", () => {
    const g = gradeHome(
      home({
        hail: [{ date: "2026-05-04", inches: 2 }],
        yearBuilt: 1998,
        ownerLivesHere: true,
        knocks: [{ status: "Do Not Knock", at: "2026-01-15" }],
      }),
      TODAY,
    );
    expect(g.color).toBe("red");
    expect(g.forced).toBe("do-not-knock");
  });
});

describe("gradeHome: hail", () => {
  it.each([
    [0.75, 0],
    [0.99, 0],
    [1, 20],
    [1.24, 20],
    [1.25, 30],
    [1.74, 30],
    [1.75, 40],
    [3, 40],
  ])("hail of %s in adds %s points", (inches, points) => {
    expect(gradeHome(home({ hail: [{ date: "2026-08-01", inches }] }), TODAY).score).toBe(points);
  });

  it("counts only the biggest storm, not every storm added together", () => {
    const hail = [
      { date: "2026-04-01", inches: 1.25 },
      { date: "2026-06-01", inches: 2 },
      { date: "2026-07-01", inches: 1 },
    ];
    expect(gradeHome(home({ hail }), TODAY).score).toBe(40);
  });

  it("counts a storm exactly 12 months ago", () => {
    expect(gradeHome(home({ hail: [{ date: "2025-09-14", inches: 2 }] }), TODAY).score).toBe(40);
  });

  it("ignores a storm one day older than 12 months", () => {
    expect(gradeHome(home({ hail: [{ date: "2025-09-13", inches: 2 }] }), TODAY).score).toBe(0);
  });

  it("explains the storm it counted", () => {
    const g = gradeHome(home({ hail: [{ date: "2026-05-04", inches: 1.75 }] }), TODAY);
    expect(g.reasons).toContainEqual({ text: "Hail 1.75 in on 4 May 2026", points: 40 });
  });

  it("says so when no hail of 1 in or bigger fell in the window", () => {
    expect(gradeHome(home(), TODAY).reasons).toContainEqual({
      text: "No hail of 1 in or bigger in the last 12 months",
      points: 0,
    });
  });
});

describe("gradeHome: house age", () => {
  it.each([
    [2015, 0],
    [2014, 10],
    [2007, 10],
    [2006, 20],
    [1950, 20],
  ])("built in %s adds %s points", (yearBuilt, points) => {
    expect(gradeHome(home({ yearBuilt }), TODAY).score).toBe(points);
  });

  it("explains the age", () => {
    expect(gradeHome(home({ yearBuilt: 1998 }), TODAY).reasons).toContainEqual({
      text: "Built 1998 (28 years old)",
      points: 20,
    });
  });

  it("treats an unknown year built as middle-aged: 10 points", () => {
    const g = gradeHome(home({ yearBuilt: null }), TODAY);
    expect(g.score).toBe(10);
    expect(g.reasons).toContainEqual({ text: "Age unknown", points: 10 });
  });

  it("treats a year built from a county flagged unreliable as unknown", () => {
    expect(gradeHome(home({ yearBuilt: 1970, yearBuiltReliable: false }), TODAY).score).toBe(10);
  });

  it("treats a year built in the future as unknown", () => {
    expect(gradeHome(home({ yearBuilt: 2027 }), TODAY).score).toBe(10);
  });
});

describe("gradeHome: owner", () => {
  it("adds 10 when the owner appears to live there", () => {
    const g = gradeHome(home({ ownerLivesHere: true }), TODAY);
    expect(g.score).toBe(10);
    expect(g.reasons).toContainEqual({ text: "Owner appears to live here", points: 10 });
  });

  it("takes 5 away when the owner appears to live elsewhere", () => {
    const g = gradeHome(home({ ownerLivesHere: false }), TODAY);
    expect(g.score).toBe(-5);
    expect(g.reasons).toContainEqual({ text: "Owner appears to live elsewhere", points: -5 });
  });

  it("adds nothing and says nothing when it is unknown who lives there", () => {
    const g = gradeHome(home({ ownerLivesHere: null }), TODAY);
    expect(g.score).toBe(0);
    expect(g.reasons.some((r) => r.text.startsWith("Owner"))).toBe(false);
  });
});

describe("gradeHome: our knock history", () => {
  it("adds 15 when a rep saw visible damage in the last 12 months", () => {
    const g = gradeHome(home({ knocks: [{ status: "Visible Damage", at: "2026-07-01" }] }), TODAY);
    expect(g.score).toBe(15);
    expect(g.reasons).toContainEqual({ text: "Rep saw visible damage on 1 Jul 2026", points: 15 });
  });

  it("ignores visible damage marked more than 12 months ago", () => {
    expect(gradeHome(home({ knocks: [{ status: "Visible Damage", at: "2025-09-01" }] }), TODAY).score).toBe(0);
  });

  it("takes 25 away for Not Interested exactly 60 days ago", () => {
    expect(gradeHome(home({ knocks: [{ status: "Not Interested", at: "2026-07-16" }] }), TODAY).score).toBe(-25);
  });

  it("ignores Not Interested 61 days ago", () => {
    expect(gradeHome(home({ knocks: [{ status: "Not Interested", at: "2026-07-15" }] }), TODAY).score).toBe(0);
  });

  it("takes 10 away when a rep marked the house as a renter", () => {
    const g = gradeHome(home({ knocks: [{ status: "Renter", at: "2025-03-02" }] }), TODAY);
    expect(g.score).toBe(-10);
    expect(g.reasons).toContainEqual({ text: "Marked as a renter on 2 Mar 2025", points: -10 });
  });

  it("matches results regardless of capital letters and extra spaces", () => {
    expect(gradeHome(home({ knocks: [{ status: "  not  interested ", at: "2026-09-01" }] }), TODAY).score).toBe(-25);
  });

  it("adds nothing for Not Home", () => {
    expect(gradeHome(home({ knocks: [{ status: "Not Home", at: "2026-09-10" }] }), TODAY).score).toBe(0);
  });

  it("says when Miller Storm has never knocked", () => {
    expect(gradeHome(home(), TODAY).reasons).toContainEqual({ text: "Not knocked by Miller Storm yet", points: 0 });
  });

  it("adds 5 when a neighbor signed with us exactly 90 days ago", () => {
    const g = gradeHome(home({ neighborSignedAt: "2026-06-16" }), TODAY);
    expect(g.score).toBe(5);
    expect(g.reasons).toContainEqual({ text: "A neighbor signed with us on 16 Jun 2026", points: 5 });
  });

  it("ignores a neighbor who signed 91 days ago", () => {
    expect(gradeHome(home({ neighborSignedAt: "2026-06-15" }), TODAY).score).toBe(0);
  });
});

describe("gradeHome: always red", () => {
  it.each(["Inspected", "Claim Filed", "Signed", "Installed"])(
    "a %s result means we are already working with this house",
    (status) => {
      const g = gradeHome(home({ yearBuilt: 1980, ownerLivesHere: true, knocks: [{ status, at: "2026-03-02" }] }), TODAY);
      expect(g.color).toBe("red");
      expect(g.forced).toBe("in-pipeline");
      expect(g.reasons[0]).toEqual({ text: `Already working with us: ${status} on 2 Mar 2026`, points: 0 });
    },
  );

  it("an open AccuLynx job means we are already working with this house", () => {
    const g = gradeHome(home({ yearBuilt: 1980, openAccuLynxJob: true }), TODAY);
    expect(g.color).toBe("red");
    expect(g.forced).toBe("in-pipeline");
    expect(g.reasons[0]).toEqual({ text: "Open AccuLynx job at this address", points: 0 });
  });

  it("Do Not Knock wins over already working with us, and is explained first", () => {
    const g = gradeHome(
      home({
        knocks: [
          { status: "Signed", at: "2026-02-01" },
          { status: "Do Not Knock", at: "2026-01-15" },
        ],
      }),
      TODAY,
    );
    expect(g.forced).toBe("do-not-knock");
    expect(g.reasons[0]).toEqual({ text: "Do not knock (marked 15 Jan 2026)", points: 0 });
  });

  it("still reports the points behind a forced red, so the backtest can use them", () => {
    const g = gradeHome(home({ yearBuilt: 1980, ownerLivesHere: true, openAccuLynxJob: true }), TODAY);
    expect(g.score).toBe(30);
    expect(g.color).toBe("red");
  });
});

describe("colorForScore", () => {
  it.each([
    [90, "green"],
    [60, "green"],
    [59, "yellow"],
    [40, "yellow"],
    [39, "orange"],
    [20, "orange"],
    [19, "red"],
    [0, "red"],
    [-30, "red"],
  ])("%s points is %s", (score, color) => {
    expect(colorForScore(score)).toBe(color);
  });
});
