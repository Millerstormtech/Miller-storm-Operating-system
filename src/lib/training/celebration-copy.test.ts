import { describe, it, expect } from "vitest";
import { celebrationMessage } from "./celebration-copy";

describe("celebrationMessage", () => {
  it("produces Youssef's exact copy", () => {
    expect(celebrationMessage("Fernando Cano", "Objections Masterclass", 4, 10)).toBe(
      "🎉 Fernando Cano just passed the Objections Masterclass Course! That's 4 of 10 courses done. Let's goo!🔥"
    );
  });

  it("trims stray whitespace in names and titles (some course titles carry trailing spaces)", () => {
    expect(celebrationMessage(" Fernando Cano ", "Knocking Your Way To Millions ", 1, 10)).toBe(
      "🎉 Fernando Cano just passed the Knocking Your Way To Millions Course! That's 1 of 10 courses done. Let's goo!🔥"
    );
  });

  it("never contains an em dash", () => {
    expect(celebrationMessage("A", "B", 2, 10)).not.toContain("—");
  });
});
