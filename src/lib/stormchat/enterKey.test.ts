import { describe, it, expect } from "vitest";
import { enterSendsMessage } from "./enterKey";

describe("enterSendsMessage", () => {
  it("computer: Enter sends", () => {
    expect(enterSendsMessage({ key: "Enter", shiftKey: false, touchScreen: false })).toBe(true);
  });

  it("computer: Shift+Enter starts a new line", () => {
    expect(enterSendsMessage({ key: "Enter", shiftKey: true, touchScreen: false })).toBe(false);
  });

  it("touch screen: Return always starts a new line (no Shift key there)", () => {
    expect(enterSendsMessage({ key: "Enter", shiftKey: false, touchScreen: true })).toBe(false);
    expect(enterSendsMessage({ key: "Enter", shiftKey: true, touchScreen: true })).toBe(false);
  });

  it("other keys never send", () => {
    expect(enterSendsMessage({ key: "a", shiftKey: false, touchScreen: false })).toBe(false);
    expect(enterSendsMessage({ key: " ", shiftKey: false, touchScreen: false })).toBe(false);
  });
});
