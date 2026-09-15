import { describe, it, expect } from "vitest";
import { countyFlags, suggestedStatus, type CountyStats } from "./quality";

// Aggregate counts from the 2025 Texas state property file, measured on
// 14 Sep 2026 (spec A5). Some are rounded from the measured percentages.
const tarrant: CountyStats = { homes: 590397, withYearBuilt: 588626, builtBefore1990: 262000, withOwnerSignal: 590397, ownerLivesHere: 462281 };
const collin: CountyStats = { homes: 319897, withYearBuilt: 317018, builtBefore1990: 64700, withOwnerSignal: 319897, ownerLivesHere: 213691 };
const dallasStateFile: CountyStats = { homes: 525712, withYearBuilt: 0, builtBefore1990: 0, withOwnerSignal: 525712, ownerLivesHere: 423724 };
const hockley: CountyStats = { homes: 7263, withYearBuilt: 4837, builtBefore1990: 124, withOwnerSignal: 7263, ownerLivesHere: 3290 };
const rockwall2023: CountyStats = { homes: 38721, withYearBuilt: 0, builtBefore1990: 0, withOwnerSignal: 38721, ownerLivesHere: 1665 };
// Ector as loaded with Prop_ID on 15 Sep 2026: 71,977 of 75,947 records reused a
// Prop_ID on a different address, and only 3,595 houses were left.
const ectorWithPropId: CountyStats = {
  homes: 3595,
  withYearBuilt: 3548,
  builtBefore1990: 3332,
  withOwnerSignal: 3577,
  ownerLivesHere: 3391,
  records: 75947,
  idConflicts: 71977,
};

describe("countyFlags and suggestedStatus on the measured counties", () => {
  it("Tarrant has no flags and can go live", () => {
    expect(countyFlags(tarrant)).toEqual([]);
    expect(suggestedStatus(countyFlags(tarrant))).toBe("live");
  });

  it("Collin, a fast-growing suburb, is not mistaken for bad data", () => {
    expect(countyFlags(collin)).toEqual([]);
  });

  it("Dallas's state file has no year built, so its houses show age unknown", () => {
    expect(countyFlags(dallasStateFile)).toEqual(["year-built-missing"]);
    expect(suggestedStatus(countyFlags(dallasStateFile))).toBe("age-unknown");
  });

  it("Hockley, with almost nothing built before 1990, needs a person to look", () => {
    expect(countyFlags(hockley)).toEqual(["year-built-suspicious"]);
    expect(suggestedStatus(countyFlags(hockley))).toBe("review");
  });

  it("Rockwall's 2023 file, where only 4% of owners seemed to live at home, needs a person to look", () => {
    expect(countyFlags(rockwall2023)).toEqual(["year-built-missing", "owner-signal-suspicious"]);
    expect(suggestedStatus(countyFlags(rockwall2023))).toBe("review");
  });

  it("Ector loaded with a Prop_ID that is really a group code needs a person to look", () => {
    expect(countyFlags(ectorWithPropId)).toEqual(["ids-repeated"]);
    expect(suggestedStatus(countyFlags(ectorWithPropId))).toBe("review");
  });

  it("Tarrant, where 5% of records reuse an id on another address, is not flagged", () => {
    expect(countyFlags({ ...tarrant, records: 757171, idConflicts: 38365 })).toEqual([]);
  });
});

describe("countyFlags thresholds", () => {
  const base: CountyStats = { homes: 1000, withYearBuilt: 1000, builtBefore1990: 500, withOwnerSignal: 1000, ownerLivesHere: 600 };

  it("a county with no homes needs review", () => {
    const flags = countyFlags({ homes: 0, withYearBuilt: 0, builtBefore1990: 0, withOwnerSignal: 0, ownerLivesHere: 0 });
    expect(flags).toEqual(["no-homes"]);
    expect(suggestedStatus(flags)).toBe("review");
  });

  it("half the homes with a year built is enough", () => {
    expect(countyFlags({ ...base, withYearBuilt: 500, builtBefore1990: 250 })).toEqual([]);
  });

  it("just under half is missing", () => {
    expect(countyFlags({ ...base, withYearBuilt: 499, builtBefore1990: 250 })).toEqual(["year-built-missing"]);
  });

  it("8% built before 1990 is believable", () => {
    expect(countyFlags({ ...base, builtBefore1990: 80 })).toEqual([]);
  });

  it("just under 8% is suspicious", () => {
    expect(countyFlags({ ...base, builtBefore1990: 79 })).toEqual(["year-built-suspicious"]);
  });

  it("30% and 95% of owners living at home are both believable", () => {
    expect(countyFlags({ ...base, ownerLivesHere: 300 })).toEqual([]);
    expect(countyFlags({ ...base, ownerLivesHere: 950 })).toEqual([]);
  });

  it("outside 30% to 95% is suspicious", () => {
    expect(countyFlags({ ...base, ownerLivesHere: 299 })).toEqual(["owner-signal-suspicious"]);
    expect(countyFlags({ ...base, ownerLivesHere: 951 })).toEqual(["owner-signal-suspicious"]);
  });

  it("an owner signal on under half the homes is missing, but the county can still go live", () => {
    const flags = countyFlags({ ...base, withOwnerSignal: 499, ownerLivesHere: 300 });
    expect(flags).toEqual(["owner-signal-missing"]);
    expect(suggestedStatus(flags)).toBe("live");
  });

  it("ids reused on other addresses for 20% of records are tolerated", () => {
    expect(countyFlags({ ...base, records: 1000, idConflicts: 200 })).toEqual([]);
  });

  it("more than 20% need review", () => {
    const flags = countyFlags({ ...base, records: 1000, idConflicts: 201 });
    expect(flags).toEqual(["ids-repeated"]);
    expect(suggestedStatus(flags)).toBe("review");
  });

  it("counts without record totals skip the id check", () => {
    expect(countyFlags({ ...base, idConflicts: 900 })).toEqual([]);
  });
});
