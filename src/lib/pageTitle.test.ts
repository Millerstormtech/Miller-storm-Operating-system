// src/lib/pageTitle.ts does not exist yet
import { describe, it, expect } from "vitest";
import { resolvePageTitle } from "./pageTitle";

const ITEMS = [
  { id: "dashboard", label: "My Dashboard" },
  { id: "rankings", label: "Sales Leaderboard" },
];

describe("resolvePageTitle", () => {
  it("prefers the explicit title", () => {
    expect(resolvePageTitle(ITEMS, "rankings", "Custom")).toBe("Custom");
  });
  it("derives the title from the sidebar item matching currentView", () => {
    expect(resolvePageTitle(ITEMS, "rankings")).toBe("Sales Leaderboard");
  });
  it("returns null when the view is not in the menu and no explicit title given", () => {
    expect(resolvePageTitle(ITEMS, "businessCards")).toBeNull();
  });
  it("treats an empty explicit title as an explicit request to hide the band", () => {
    // A page passes pageTitle="" to suppress the PageHeader entirely (e.g.
    // StormChat / Master Bot Builder / Email Config), so it must NOT fall back
    // to the sidebar label.
    expect(resolvePageTitle(ITEMS, "rankings", "")).toBeNull();
  });
});
