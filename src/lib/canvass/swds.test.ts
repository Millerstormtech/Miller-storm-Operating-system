// src/lib/canvass/swds.test.ts
import { describe, it, expect } from "vitest";
import { isSwdsHomesteadCode, mainAreaCodes, swdsPropId } from "./swds";

// Southwest Data Solutions "web file" exports, the format Hood CAD and Midland
// CAD publish. Codes counted in Hood's 2026 file on 15 Sep 2026.

describe("swdsPropId", () => {
  it("turns a real-property id into the state file's Prop_ID by dropping the R and leading zeros", () => {
    expect(swdsPropId("R000012345")).toBe("12345");
    expect(swdsPropId(" r12345 ")).toBe("12345");
  });

  it("is empty for mineral, personal-property and mobile-home accounts, which are not parcels", () => {
    for (const id of ["N000012345", "P000012345", "M000012345", ""]) {
      expect(swdsPropId(id)).toBe("");
    }
  });
});

describe("isSwdsHomesteadCode", () => {
  it("counts homestead, senior, disabled and disabled-veteran homestead codes", () => {
    for (const code of ["H", "S", "D", "DVH", "DVS"]) {
      expect(isSwdsHomesteadCode(code)).toBe(true);
    }
  });

  it("does not count blanks or codes whose meaning is not known yet", () => {
    for (const code of ["", "F", "SPRO", "DVD", "DVF"]) {
      expect(isSwdsHomesteadCode(code)).toBe(false);
    }
  });
});

describe("mainAreaCodes", () => {
  it("collects the building codes the district's own code table marks as main area", () => {
    const rows = [
      { code: "LA", mainArea: "True" },
      { code: "LA2", mainArea: "True" },
      { code: "POR", mainArea: "False" },
      { code: "AG", mainArea: "False" },
    ];
    expect(mainAreaCodes(rows)).toEqual(new Set(["LA", "LA2"]));
  });

  it("ignores spaces and letter case in the code and the flag", () => {
    expect(mainAreaCodes([{ code: " la3 ", mainArea: " true " }])).toEqual(new Set(["LA3"]));
  });
});
