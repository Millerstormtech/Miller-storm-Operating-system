// src/lib/canvass/jobs.test.ts
import { describe, it, expect } from "vitest";
import { mapJob, isOpenJob, signedDateFrom } from "./jobs";

// Shaped like one item of AccuLynx GET /jobs (field names checked 15 Sep 2026). Made-up values.
function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    jobNumber: "DFW-1001",
    jobName: "Sample Homeowner",
    contacts: [{ id: "c1", contact: { id: "p1", _link: "x" }, isPrimary: true, relationToPrimary: "Self", _link: "x" }],
    locationAddress: {
      street1: "1402 Example St",
      city: "Fort Worth",
      state: { id: 44, name: "Texas", abbreviation: "TX", _link: "x" },
      zipCode: "76116",
      country: { id: 1, name: "United States", abbreviation: "US", _link: "x" },
    },
    geoLocation: { latitude: 32.7312, longitude: -97.4101 },
    tradeTypes: [
      { id: "t1", name: "Roofing" },
      { id: "t2", name: "Gutters" },
    ],
    jobCategory: { id: 1, categoryId: 1, name: "Residential" },
    workType: { id: 2, name: "Insurance", systemDefault: false, _link: "x" },
    leadSource: { id: "l1", name: "Door Knock", _link: "x" },
    leadDeadReason: "",
    currentMilestone: "Approved",
    milestoneDate: "2026-05-20T15:04:05Z",
    createdDate: "2026-05-01T12:00:00Z",
    modifiedDate: "2026-05-21T09:30:00Z",
    priority: "Normal",
    _link: "x",
    ...overrides,
  };
}

describe("mapJob", () => {
  it("keeps the job's id, number, branch, stage and dates", () => {
    expect(mapJob(job(), "DFW")).toMatchObject({
      jobId: "job-1",
      jobNumber: "DFW-1001",
      branch: "DFW",
      milestone: "Approved",
      milestoneAt: "2026-05-20T15:04:05Z",
      jobCreatedAt: "2026-05-01T12:00:00Z",
      jobModifiedAt: "2026-05-21T09:30:00Z",
    });
  });

  it("stores the map position as a GeoJSON point, longitude first", () => {
    expect(mapJob(job(), "DFW").location).toEqual({ type: "Point", coordinates: [-97.4101, 32.7312] });
  });

  it("keeps the street address with the state abbreviation", () => {
    expect(mapJob(job(), "DFW").address).toEqual({ line: "1402 Example St", city: "Fort Worth", state: "TX", zip: "76116" });
  });

  it("adds a second street line after the first", () => {
    const withUnit = job({ locationAddress: { ...job().locationAddress, street2: "Unit 4" } });
    expect(mapJob(withUnit, "DFW").address.line).toBe("1402 Example St Unit 4");
  });

  it("keeps trade, work type and category names", () => {
    const record = mapJob(job(), "DFW");
    expect(record.tradeTypes).toEqual(["Roofing", "Gutters"]);
    expect(record.workType).toBe("Insurance");
    expect(record.jobCategory).toBe("Residential");
  });

  it("never copies the job name, contacts or lead details", () => {
    const record = mapJob(job(), "DFW");
    expect(JSON.stringify(record)).not.toContain("Sample Homeowner");
    expect(record).not.toHaveProperty("jobName");
    expect(record).not.toHaveProperty("contacts");
    expect(record).not.toHaveProperty("leadSource");
    expect(record).not.toHaveProperty("leadDeadReason");
  });

  it("has no map position when geoLocation is missing", () => {
    expect(mapJob(job({ geoLocation: undefined }), "DFW").location).toBeNull();
  });

  it("has no map position for a 0,0 point, an impossible latitude or a non-number", () => {
    expect(mapJob(job({ geoLocation: { latitude: 0, longitude: 0 } }), "DFW").location).toBeNull();
    expect(mapJob(job({ geoLocation: { latitude: 132.7, longitude: -97.4 } }), "DFW").location).toBeNull();
    expect(mapJob(job({ geoLocation: { latitude: "32.7", longitude: -97.4 } }), "DFW").location).toBeNull();
  });

  it("uses empty values when optional parts are missing", () => {
    const record = mapJob(
      job({ tradeTypes: undefined, workType: undefined, jobCategory: undefined, locationAddress: undefined, milestoneDate: undefined }),
      "DFW"
    );
    expect(record.tradeTypes).toEqual([]);
    expect(record.workType).toBe("");
    expect(record.jobCategory).toBe("");
    expect(record.address).toEqual({ line: "", city: "", state: "", zip: "" });
    expect(record.milestoneAt).toBeNull();
  });
});

describe("isOpenJob", () => {
  it("counts every stage except Cancelled, Closed included (spec A4: open means not cancelled)", () => {
    for (const milestone of ["Lead", "Prospect", "Approved", "Completed", "Invoiced", "Closed"]) {
      expect(isOpenJob(mapJob(job({ currentMilestone: milestone }), "DFW"))).toBe(true);
    }
  });

  it("does not count a Cancelled job", () => {
    expect(isOpenJob(mapJob(job({ currentMilestone: "Cancelled" }), "DFW"))).toBe(false);
  });
});

describe("signedDateFrom", () => {
  // AccuLynx GET /jobs/{id}/milestone-history answers { items: [{ name, date }] },
  // the same shape the leaderboard sync reads.
  it("takes the day the job reached Approved, the stage the leaderboard counts as a signed contract", () => {
    const history = {
      items: [
        { name: "Lead", date: "2026-03-01T15:00:00Z" },
        { name: "Prospect", date: "2026-03-10T15:00:00Z" },
        { name: "Approved", date: "2026-04-02T16:30:00Z" },
      ],
    };
    expect(signedDateFrom(history)).toBe("2026-04-02T16:30:00Z");
  });

  it("is null for a job that never reached Approved", () => {
    expect(signedDateFrom({ items: [{ name: "Lead", date: "2026-03-01T15:00:00Z" }] })).toBeNull();
  });

  it("is null for a missing or empty history", () => {
    expect(signedDateFrom(null)).toBeNull();
    expect(signedDateFrom({ items: [] })).toBeNull();
  });
});
