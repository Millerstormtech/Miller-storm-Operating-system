// VITEST (describe/it/expect), not node:test. This folder is mixed: contractKing
// and conversion run here, identity/merge/ranking run under `npm run test:node`.
// Registered individually in vitest.config.ts — a test file not named there runs
// NOWHERE and reports nothing.
import { describe, it, expect } from "vitest";
import {
  isFormerRep,
  compareRepOptions,
  buildRepOptions,
  stripFormerMarker,
  FORMER_NAME_MARKERS,
} from "./formerRep";

describe("isFormerRep", () => {
  it("trusts the RepCard status flag", () => {
    expect(isFormerRep({ name: "Cody Rivera", former: true })).toBe(true);
    expect(isFormerRep({ name: "Cody Rivera", former: false })).toBe(false);
  });

  it("also catches a cross mark typed into the synced name", () => {
    // The board never draws this marker: it arrives as literal characters in
    // the RepCard name. Status can still say ACTIVE, which is exactly why the
    // name has to be read too.
    expect(isFormerRep({ name: "❌ Dakota Porter", former: false })).toBe(true);
  });

  it("catches every cross-mark variant an admin might type", () => {
    for (const marker of FORMER_NAME_MARKERS) {
      expect(isFormerRep({ name: `${marker} Waylon Dean`, former: false })).toBe(true);
    }
  });

  it("finds the marker wherever it sits in the name", () => {
    expect(isFormerRep({ name: "Martin Ramirez ❌", former: false })).toBe(true);
  });

  it("treats missing/blank fields as CURRENT, never former", () => {
    // A rep is never hidden on absent data: an unknown status must not silently
    // remove a real rep from the board.
    expect(isFormerRep({})).toBe(false);
    expect(isFormerRep({ name: "", former: null })).toBe(false);
    expect(isFormerRep({ name: "Austin Apple" })).toBe(false);
  });

  it("does not mistake an ordinary letter x for a cross mark", () => {
    expect(isFormerRep({ name: "Xavier Cox" })).toBe(false);
    expect(isFormerRep({ name: "Max Dixon" })).toBe(false);
  });
});

describe("stripFormerMarker", () => {
  it("removes a leading cross mark and the space after it", () => {
    expect(stripFormerMarker("❌ Dakota Porter")).toBe("Dakota Porter");
  });

  it("removes a trailing cross mark", () => {
    expect(stripFormerMarker("Martin Ramirez ❌")).toBe("Martin Ramirez");
  });

  it("removes every variant, and more than one", () => {
    expect(stripFormerMarker("❌❌ Waylon Dean ✗")).toBe("Waylon Dean");
  });

  it("leaves an unmarked name untouched", () => {
    expect(stripFormerMarker("Cody Rivera")).toBe("Cody Rivera");
    expect(stripFormerMarker("Xavier Cox")).toBe("Xavier Cox");
  });

  it("survives an empty name", () => {
    expect(stripFormerMarker("")).toBe("");
    expect(stripFormerMarker("❌")).toBe("");
  });
});

describe("compareRepOptions", () => {
  const opt = (name: string, former: boolean) => ({ id: name, name, former });

  it("sinks former reps below current reps", () => {
    expect(compareRepOptions(opt("Aaron", false), opt("Zach", true))).toBeLessThan(0);
    expect(compareRepOptions(opt("Zach", true), opt("Aaron", false))).toBeGreaterThan(0);
  });

  it("sorts alphabetically within each group", () => {
    expect(compareRepOptions(opt("Aaron", false), opt("Brandon", false))).toBeLessThan(0);
    expect(compareRepOptions(opt("Waylon", true), opt("Dakota", true))).toBeGreaterThan(0);
  });
});

describe("buildRepOptions", () => {
  // Deliberately mixed: the marker sits on the alphabetically LAST former rep
  // (Waylon) and is ABSENT from the alphabetically first (Dakota, flagged only
  // by status). An implementation that sorts raw names returns Waylon before
  // Dakota, because "❌" sorts ahead of "D". A test that put the marker on
  // Dakota instead would pass on that broken implementation by luck.
  const rows = [
    { id: "rc:1", name: "Dakota Porter", former: true },     // former, NO marker
    { id: "rc:2", name: "Cody Rivera", former: false },
    { id: "rc:3", name: "❌ Waylon Dean", former: true },     // former, marker present
    { id: "rc:4", name: "Aaron Smith", former: false },
    { id: "rc:5", name: "Zach Turner", former: false },
  ];

  it("puts current reps first (A-Z), then former reps (A-Z)", () => {
    expect(buildRepOptions(rows, { hideFormer: false }).map((r) => r.name)).toEqual([
      "Aaron Smith",
      "Cody Rivera",
      "Zach Turner",
      "Dakota Porter",
      "Waylon Dean",
    ]);
  });

  it("sorts the former group alphabetically regardless of who carries a marker", () => {
    // The specific regression: Waylon jumped ahead of Dakota because the raw
    // name was the sort key. Z sorting before D inside a group is the tell.
    const former = buildRepOptions(rows, { hideFormer: false }).filter((r) => r.former);
    expect(former.map((r) => r.name)).toEqual(["Dakota Porter", "Waylon Dean"]);
  });

  it("returns the display name stripped, so the caller renders its own badge", () => {
    const waylon = buildRepOptions(rows, { hideFormer: false }).find((r) => r.id === "rc:3");
    expect(waylon).toEqual({ id: "rc:3", name: "Waylon Dean", former: true });
  });

  it("drops former reps entirely when the checkbox is on", () => {
    expect(buildRepOptions(rows, { hideFormer: true }).map((r) => r.name)).toEqual([
      "Aaron Smith",
      "Cody Rivera",
      "Zach Turner",
    ]);
  });

  it("hides a former rep detected ONLY by the marker in their name", () => {
    const markerOnly = [{ id: "rc:9", name: "❌ Ghost Rep", former: false }];
    expect(buildRepOptions(markerOnly, { hideFormer: true })).toEqual([]);
  });

  it("de-duplicates by id and keeps the first row seen", () => {
    const dupes = [
      { id: "rc:1", name: "Cody Rivera", former: false },
      { id: "rc:1", name: "Cody Rivera (stale)", former: false },
    ];
    expect(buildRepOptions(dupes, { hideFormer: false })).toEqual([
      { id: "rc:1", name: "Cody Rivera", former: false },
    ]);
  });

  it("skips rows with no id and names the nameless", () => {
    // "❌" alone strips to "", which must still fall back rather than render blank.
    const messy = [{ id: "", name: "Ghost" }, { id: "rc:9", name: "" }, { id: "rc:8", name: "❌" }];
    // Same fallback label on both, so the former-first key alone decides order.
    expect(buildRepOptions(messy, { hideFormer: false })).toEqual([
      { id: "rc:9", name: "Unknown Rep", former: false },
      { id: "rc:8", name: "Unknown Rep", former: true },
    ]);
  });
});
