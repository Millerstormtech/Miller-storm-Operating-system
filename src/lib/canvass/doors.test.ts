// src/lib/canvass/doors.test.ts
import { describe, it, expect } from "vitest";
import { mapDoor, doorEvents, repcardTime } from "./doors";

// Shaped like one item of RepCard GET /customers (field names and formats checked 15 Sep 2026). Made-up values.
function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: 15882543,
    fullName: "Sample Homeowner",
    firstName: "Sample",
    lastName: "Homeowner",
    name: null,
    email: "homeowner@example.com",
    countryCode: "+1",
    isoCountryCode: "US",
    phoneNumber: "8175550100",
    companyName: null,
    statusId: 3522831,
    statusTitle: "Not Interested",
    address: "1402 Example St",
    address2: null,
    state: "TX",
    city: "Fort Worth",
    zip: "76116",
    latitude: "32.73120443",
    longitude: "-97.410109",
    externalId: null,
    type: 1,
    typeDisplayName: "Lead",
    userId: 501,
    ownerId: 501,
    houseId: "663a1f0e9b1c2d3e4f5a6b7c",
    createdAt: "2024-05-06T20:15:30.000000Z",
    updatedAt: "2026-04-02T18:30:04.000000Z",
    contactDistance: 12.5,
    companyId: 77,
    displayShortName: "SH",
    formattedPhoneNumber: "(817) 555-0100",
    fullAddress: "1402 Example St, Fort Worth, TX 76116",
    doorKnocks: [
      { userId: 501, user: "Rep One", door_knocked_at: "2026-03-01T17:00:00.000000Z", status: "Not Home" },
      { userId: 502, user: "Rep Two", door_knocked_at: "2026-04-02T18:30:00.000000Z", status: "Not Interested" },
    ],
    verifiedDoorKnocks: [
      { userId: 502, user: "Rep Two", door_knocked_at: "2026-04-02T18:30:00.000000Z", status: "Not Interested", contact_distance: 8.2 },
    ],
    statusChangeLogs: [
      { userId: 501, user: "Rep One", statusFrom: "", statusTo: "Not Home", createdAt: "2026-03-01T17:00:05.000000Z" },
      { userId: 502, user: "Rep Two", statusFrom: "Not Home", statusTo: "Not Interested", createdAt: "2026-04-02T18:30:04.000000Z" },
    ],
    notes: "Homeowner said call back",
    attachments: null,
    "roof_photos_66e7fa0f-1cb4-4d73-a5e5-d8ed75f0018f": [],
    "documents_fac7a73c-b735-498e-8a04-f734294e526f": [],
    ...overrides,
  };
}

describe("repcardTime", () => {
  it("trims RepCard's microseconds to a standard UTC timestamp", () => {
    expect(repcardTime("2024-05-06T20:15:30.123456Z")).toBe("2024-05-06T20:15:30.123Z");
  });

  it("accepts a timestamp without fractions", () => {
    expect(repcardTime("2024-05-06T20:15:30Z")).toBe("2024-05-06T20:15:30.000Z");
  });

  it("returns null for blanks and non-dates", () => {
    expect(repcardTime(null)).toBeNull();
    expect(repcardTime("")).toBeNull();
    expect(repcardTime("not a date")).toBeNull();
  });
});

describe("mapDoor", () => {
  it("keeps the door id, house id, contact type, current status, owner and dates", () => {
    expect(mapDoor(customer())).toMatchObject({
      doorId: 15882543,
      houseId: "663a1f0e9b1c2d3e4f5a6b7c",
      contactType: "Lead",
      status: "Not Interested",
      ownerUserId: 501,
      doorCreatedAt: "2024-05-06T20:15:30.000Z",
      doorUpdatedAt: "2026-04-02T18:30:04.000Z",
    });
  });

  it("turns the text coordinates into a GeoJSON point, longitude first", () => {
    expect(mapDoor(customer()).location).toEqual({ type: "Point", coordinates: [-97.410109, 32.73120443] });
  });

  it("has no map position when a coordinate is 0, blank or not a number", () => {
    expect(mapDoor(customer({ latitude: "0", longitude: "0" })).location).toBeNull();
    expect(mapDoor(customer({ latitude: "", longitude: "-97.41" })).location).toBeNull();
    expect(mapDoor(customer({ latitude: "abc", longitude: "-97.41" })).location).toBeNull();
    expect(mapDoor(customer({ latitude: "132.7", longitude: "-97.41" })).location).toBeNull();
  });

  it("builds the address from its parts, adding a second line", () => {
    expect(mapDoor(customer()).address).toEqual({ line: "1402 Example St", city: "Fort Worth", state: "TX", zip: "76116" });
    expect(mapDoor(customer({ address2: "Apt 2" })).address.line).toBe("1402 Example St Apt 2");
  });

  it("uses an empty house id when RepCard has none", () => {
    expect(mapDoor(customer({ houseId: null })).houseId).toBe("");
  });

  it("keeps each knock once, oldest first, marking the verified ones", () => {
    expect(mapDoor(customer()).knocks).toEqual([
      { at: "2026-03-01T17:00:00.000Z", status: "Not Home", userId: 501, rep: "Rep One", verified: false },
      { at: "2026-04-02T18:30:00.000Z", status: "Not Interested", userId: 502, rep: "Rep Two", verified: true },
    ]);
  });

  it("sorts knocks and status changes oldest first even when sent out of order", () => {
    const door = mapDoor(customer({ doorKnocks: [...customer().doorKnocks].reverse(), statusChangeLogs: [...customer().statusChangeLogs].reverse() }));
    expect(door.knocks.map((k) => k.status)).toEqual(["Not Home", "Not Interested"]);
    expect(door.statusChanges.map((c) => c.to)).toEqual(["Not Home", "Not Interested"]);
  });

  it("keeps status changes with who made them", () => {
    expect(mapDoor(customer()).statusChanges[1]).toEqual({
      at: "2026-04-02T18:30:04.000Z",
      from: "Not Home",
      to: "Not Interested",
      userId: 502,
      rep: "Rep Two",
    });
  });

  it("never copies the homeowner's name, email, phone, notes or custom fields", () => {
    const door = mapDoor(customer());
    const text = JSON.stringify(door);
    for (const secret of ["Sample Homeowner", "Homeowner", "homeowner@example.com", "8175550100", "(817) 555-0100", "call back"]) {
      expect(text).not.toContain(secret);
    }
    for (const field of ["fullName", "firstName", "lastName", "email", "phoneNumber", "formattedPhoneNumber", "displayShortName", "fullAddress", "notes", "companyName"]) {
      expect(door).not.toHaveProperty(field);
    }
    expect(Object.keys(door).some((key) => key.startsWith("roof_photos") || key.startsWith("documents"))).toBe(false);
  });

  it("dates the current status from the newest status change to it", () => {
    expect(mapDoor(customer())).toMatchObject({ statusAt: "2026-04-02T18:30:04.000Z", statusAtSource: "log" });
  });

  it("dates the current status from the newest knock with it when no status change matches", () => {
    expect(mapDoor(customer({ statusChangeLogs: [] }))).toMatchObject({ statusAt: "2026-04-02T18:30:00.000Z", statusAtSource: "knock" });
  });

  it("falls back to the record's last update when neither matches", () => {
    expect(mapDoor(customer({ statusTitle: "Renter", statusChangeLogs: [] }))).toMatchObject({
      statusAt: "2026-04-02T18:30:04.000Z",
      statusAtSource: "updated",
    });
  });
});

describe("doorEvents", () => {
  it("merges knocks, status changes and the current status, oldest first, dropping same-status repeats within 10 minutes", () => {
    expect(doorEvents(mapDoor(customer()))).toEqual([
      { at: "2026-03-01T17:00:00.000Z", status: "Not Home", rep: "Rep One" },
      { at: "2026-04-02T18:30:00.000Z", status: "Not Interested", rep: "Rep Two" },
    ]);
  });

  it("keeps the same status twice when it was set on different days", () => {
    const door = mapDoor(
      customer({
        statusTitle: "Not Home",
        doorKnocks: [
          { userId: 501, user: "Rep One", door_knocked_at: "2026-03-01T17:00:00.000000Z", status: "Not Home" },
          { userId: 501, user: "Rep One", door_knocked_at: "2026-03-08T17:00:00.000000Z", status: "Not Home" },
        ],
        verifiedDoorKnocks: [],
        statusChangeLogs: [],
      })
    );
    expect(doorEvents(door).map((e) => e.at)).toEqual(["2026-03-01T17:00:00.000Z", "2026-03-08T17:00:00.000Z"]);
  });

  it("adds the current status when nothing else records it", () => {
    const door = mapDoor(customer({ statusTitle: "Do Not Knock", doorKnocks: [], verifiedDoorKnocks: [], statusChangeLogs: [] }));
    expect(doorEvents(door)).toEqual([{ at: "2026-04-02T18:30:04.000Z", status: "Do Not Knock", rep: "" }]);
  });

  it("skips events with no time or no status", () => {
    const door = mapDoor(
      customer({
        statusTitle: "",
        doorKnocks: [{ userId: 501, user: "Rep One", door_knocked_at: null, status: "Not Home" }],
        verifiedDoorKnocks: [],
        statusChangeLogs: [{ userId: 501, user: "Rep One", statusFrom: "", statusTo: "", createdAt: "2026-03-01T17:00:05.000000Z" }],
      })
    );
    expect(doorEvents(door)).toEqual([]);
  });
});
