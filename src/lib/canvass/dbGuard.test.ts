import { describe, it, expect } from "vitest";
import { isLocalTestDatabase } from "./dbGuard";

// The Canvass Map import scripts write millions of rows. They must only ever
// write to the test database on this computer unless someone deliberately
// passes --allow-remote. The live database is reached from this laptop through
// an SSH tunnel on 127.0.0.1:27018, so "127.0.0.1" alone does NOT mean local.

describe("isLocalTestDatabase", () => {
  it.each([
    ["mongodb://127.0.0.1:27017/millerstorm"],
    ["mongodb://localhost:27017/millerstorm"],
    ["mongodb://127.0.0.1/millerstorm"],
  ])("allows the test database on this computer: %s", (uri) => {
    expect(isLocalTestDatabase(uri)).toBe(true);
  });

  it("refuses port 27018, where the SSH tunnel to the live database listens", () => {
    expect(isLocalTestDatabase("mongodb://127.0.0.1:27018/millerstorm")).toBe(false);
  });

  it("refuses an address with a user name and password, which only the live database has", () => {
    expect(isLocalTestDatabase("mongodb://admin:secret@127.0.0.1:27017/millerstorm")).toBe(false);
  });

  it("refuses the live server's name", () => {
    expect(isLocalTestDatabase("mongodb://millerstorm.tech:27017/millerstorm")).toBe(false);
  });

  it("refuses a cloud cluster address", () => {
    expect(isLocalTestDatabase("mongodb+srv://cluster0.example.net/millerstorm")).toBe(false);
  });

  it("refuses a list of hosts that includes any other computer", () => {
    expect(isLocalTestDatabase("mongodb://127.0.0.1:27017,10.0.0.5:27017/millerstorm")).toBe(false);
  });

  it("refuses something that is not a MongoDB address", () => {
    expect(isLocalTestDatabase("http://127.0.0.1:27017/millerstorm")).toBe(false);
    expect(isLocalTestDatabase("")).toBe(false);
  });
});
