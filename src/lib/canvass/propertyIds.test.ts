// src/lib/canvass/propertyIds.test.ts
import { describe, it, expect } from "vitest";
import { chooseIdField, createIdConflictCounter, type IdFieldCounts } from "./propertyIds";

// "Conflicts" are records whose id was already seen on a DIFFERENT situs address.
// A real property id repeats only on the same address (one property split into
// several records). Counts measured on the TxGIO 2025 county files, 15 Sep 2026.

describe("chooseIdField", () => {
  it("keeps Prop_ID when it never repeats on a different address (Williamson)", () => {
    const williamson: IdFieldCounts = { records: 282983, propIdValues: 282870, propIdConflicts: 0, geoIdValues: 0, geoIdConflicts: 0 };
    expect(chooseIdField(williamson)).toBe("Prop_ID");
  });

  it("keeps Prop_ID for Tarrant, where 5% of records reuse an id on another address and GEO_ID is empty", () => {
    const tarrant: IdFieldCounts = { records: 757171, propIdValues: 757171, propIdConflicts: 38365, geoIdValues: 0, geoIdConflicts: 0 };
    expect(chooseIdField(tarrant)).toBe("Prop_ID");
  });

  it("switches to GEO_ID when Prop_ID is a shared group code (Ector: 95% on other addresses)", () => {
    const ector: IdFieldCounts = { records: 75947, propIdValues: 75947, propIdConflicts: 71977, geoIdValues: 75496, geoIdConflicts: 0 };
    expect(chooseIdField(ector)).toBe("GEO_ID");
  });

  it("keeps a clean Prop_ID even when GEO_ID is messier (Cooke)", () => {
    const cooke: IdFieldCounts = { records: 33170, propIdValues: 33170, propIdConflicts: 0, geoIdValues: 33170, geoIdConflicts: 2520 };
    expect(chooseIdField(cooke)).toBe("Prop_ID");
  });

  it("keeps Prop_ID when both are equally messy (Travis: 33% each)", () => {
    const travis: IdFieldCounts = { records: 834936, propIdValues: 834936, propIdConflicts: 273299, geoIdValues: 834936, geoIdConflicts: 273295 };
    expect(chooseIdField(travis)).toBe("Prop_ID");
  });

  it("switches when both are messy only if GEO_ID is at most half as messy", () => {
    expect(chooseIdField({ records: 1000, propIdValues: 1000, propIdConflicts: 600, geoIdValues: 1000, geoIdConflicts: 250 })).toBe("GEO_ID");
    expect(chooseIdField({ records: 1000, propIdValues: 1000, propIdConflicts: 400, geoIdValues: 1000, geoIdConflicts: 250 })).toBe("Prop_ID");
  });

  it("treats 20% on other addresses as still clean, and just over as not", () => {
    expect(chooseIdField({ records: 1000, propIdValues: 1000, propIdConflicts: 200, geoIdValues: 1000, geoIdConflicts: 0 })).toBe("Prop_ID");
    expect(chooseIdField({ records: 1000, propIdValues: 1000, propIdConflicts: 201, geoIdValues: 1000, geoIdConflicts: 0 })).toBe("GEO_ID");
  });

  it("switches to a clean GEO_ID when Prop_ID is mostly blank", () => {
    expect(chooseIdField({ records: 1000, propIdValues: 100, propIdConflicts: 0, geoIdValues: 990, geoIdConflicts: 0 })).toBe("GEO_ID");
  });

  it("does not switch to a GEO_ID filled on under half the records", () => {
    expect(chooseIdField({ records: 1000, propIdValues: 1000, propIdConflicts: 900, geoIdValues: 499, geoIdConflicts: 0 })).toBe("Prop_ID");
  });

  it("keeps Prop_ID for an empty file", () => {
    expect(chooseIdField({ records: 0, propIdValues: 0, propIdConflicts: 0, geoIdValues: 0, geoIdConflicts: 0 })).toBe("Prop_ID");
  });
});

describe("createIdConflictCounter", () => {
  it("counts filled ids and ids seen again on a different address, for both fields", () => {
    const counter = createIdConflictCounter();
    counter.add({ propId: "1576", geoId: "A-1", address: "100 MAIN ST" });
    counter.add({ propId: "1576", geoId: "A-2", address: "102 MAIN ST" }); // Prop_ID reused on another address
    counter.add({ propId: "1577", geoId: "A-1", address: "100  main st" }); // GEO_ID repeat on the same address, spacing aside
    counter.add({ propId: "", geoId: "A-3", address: "104 MAIN ST" });
    expect(counter.counts()).toEqual({ records: 4, recordsWithId: 4, propIdValues: 3, propIdConflicts: 1, geoIdValues: 4, geoIdConflicts: 0 });
  });

  it("does not count a repeat when either address is blank", () => {
    const counter = createIdConflictCounter();
    counter.add({ propId: "9", geoId: "", address: "" });
    counter.add({ propId: "9", geoId: "", address: "100 MAIN ST" });
    counter.add({ propId: "9", geoId: "", address: "" });
    expect(counter.counts()).toMatchObject({ propIdValues: 3, propIdConflicts: 0 });
  });

  it("knows the share of conflicts for a chosen field", () => {
    const counter = createIdConflictCounter();
    counter.add({ propId: "1", geoId: "X", address: "1 A ST" });
    counter.add({ propId: "1", geoId: "Y", address: "2 A ST" });
    expect(counter.counts().propIdConflicts).toBe(1);
    expect(counter.counts().geoIdConflicts).toBe(0);
  });
});

describe("placeholders and street-less addresses (the Travis false alarm, review 17 Sep 2026)", () => {
  // Travis CAD's state file: the id "0" on half the records, and ", TX 78704"
  // style addresses (state and ZIP only) on most of the rest. The old counter
  // called that 32.7% conflicts; the real share is 0.45%.
  const travisLike = () => {
    const counter = createIdConflictCounter();
    for (let i = 0; i < 100; i++) counter.add({ propId: "0", geoId: "0", address: i % 2 ? ", TX 78704" : ", TX 78746" });
    for (let i = 0; i < 100; i++) counter.add({ propId: `${1000 + i}`, geoId: `${1000 + i}`, address: i % 3 ? ", TX 78704" : `${i} ELM ST, AUSTIN, TX 78704` });
    counter.add({ propId: "1001", geoId: "1001", address: ", TX 78746" }); // the same real id again, street-less: proves nothing
    return counter;
  };

  it("does not count the placeholder id as an id, nor its records as filled", () => {
    const counts = travisLike().counts();
    expect(counts.records).toBe(201);
    expect(counts.recordsWithId).toBe(101);
    expect(counts.propIdValues).toBe(101);
  });

  it("does not count a repeat when the address is only a state and ZIP", () => {
    const counts = travisLike().counts();
    expect(counts.propIdConflicts).toBe(0);
    expect(counts.geoIdConflicts).toBe(0);
    expect(chooseIdField(counts)).toBe("Prop_ID");
  });

  it("still counts a real conflict between two numbered addresses", () => {
    const counter = travisLike();
    counter.add({ propId: "1000", geoId: "1000", address: "999 OTHER RD, AUSTIN, TX 78704" }); // 1000 was "0 ELM ST"
    expect(counter.counts().propIdConflicts).toBe(1);
  });

  it("still catches a group code (Ector) when the addresses are real", () => {
    const counter = createIdConflictCounter();
    for (let i = 0; i < 100; i++) counter.add({ propId: "GROUP7", geoId: `${i}`, address: `${i} MAIN ST, ODESSA, TX 79761` });
    const counts = counter.counts();
    expect(counts.propIdConflicts / counts.propIdValues).toBeGreaterThan(0.9);
    expect(chooseIdField(counts)).toBe("GEO_ID");
  });

  it("judges 'filled' against records that carry a real id, so a placeholder-heavy file keeps Prop_ID", () => {
    // 60% placeholders: Prop_ID is on only 40% of all records but on 100% of the real ones.
    expect(chooseIdField({ records: 100, recordsWithId: 40, propIdValues: 40, propIdConflicts: 0, geoIdValues: 40, geoIdConflicts: 0 })).toBe("Prop_ID");
  });
});
