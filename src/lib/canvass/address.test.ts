import { describe, it, expect } from "vitest";
import { normalizeAddressLine, addressKey, ownerLivesHere } from "./address";

// Every address in this file is made up.

describe("normalizeAddressLine", () => {
  it("upper-cases, drops punctuation and shortens common street words", () => {
    expect(normalizeAddressLine("1402 Example Drive, Apt. 5")).toBe("1402 EXAMPLE DR APT 5");
  });

  it("collapses extra spaces and shortens directions", () => {
    expect(normalizeAddressLine("  901   North  Main   Street ")).toBe("901 N MAIN ST");
  });
});

describe("addressKey", () => {
  it("is the house number, the first word of the street name, and the ZIP", () => {
    expect(addressKey("1402 Example Dr", "76116")).toBe("1402|EXAMPLE|76116");
  });

  it("skips a leading direction, so N Main and Main give the same key", () => {
    expect(addressKey("901 N Main St", "76102")).toBe("901|MAIN|76102");
  });

  it("uses only the first five digits of a ZIP+4", () => {
    expect(addressKey("1402 Example Dr", "76116-1234")).toBe("1402|EXAMPLE|76116");
  });

  it("leaves the ZIP part empty when there is no ZIP", () => {
    expect(addressKey("1402 Example Dr", "")).toBe("1402|EXAMPLE|");
  });

  it("is null when the line has no house number", () => {
    expect(addressKey("Example Dr", "76116")).toBeNull();
  });
});

describe("ownerLivesHere", () => {
  const house = { line: "1402 EXAMPLE DR", zip: "76116" };

  it("is true when the mailing address is the house, however it is written", () => {
    expect(ownerLivesHere(house, { line: "1402 Example Drive", zip: "76116-1234" })).toBe(true);
  });

  it("is false for a different house number", () => {
    expect(ownerLivesHere(house, { line: "1404 Example Dr", zip: "76116" })).toBe(false);
  });

  it("is false for a different street", () => {
    expect(ownerLivesHere(house, { line: "1402 Sample Ln", zip: "76116" })).toBe(false);
  });

  it("is false for the same street address in a different ZIP", () => {
    expect(ownerLivesHere(house, { line: "1402 Example Dr", zip: "75201" })).toBe(false);
  });

  it("compares number and street alone when the mailing ZIP is missing", () => {
    expect(ownerLivesHere(house, { line: "1402 Example Dr", zip: "" })).toBe(true);
  });

  it("is unknown for a PO Box, which owners who do live there often use in rural areas", () => {
    expect(ownerLivesHere(house, { line: "PO Box 123", zip: "79336" })).toBeNull();
  });

  it("recognizes P.O. BOX written with dots", () => {
    expect(ownerLivesHere(house, { line: "P.O. BOX 88", zip: "79336" })).toBeNull();
  });

  it("is unknown when the mailing address is blank", () => {
    expect(ownerLivesHere(house, { line: "  ", zip: "" })).toBeNull();
  });

  it("is unknown when the mailing address has no house number", () => {
    expect(ownerLivesHere(house, { line: "Rural Route 2", zip: "76116" })).toBeNull();
  });

  it("is unknown when the house address has no number", () => {
    expect(ownerLivesHere({ line: "EXAMPLE DR", zip: "76116" }, { line: "1402 Example Dr", zip: "76116" })).toBeNull();
  });
});
