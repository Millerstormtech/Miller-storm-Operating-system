import { describe, it, expect } from "vitest";
import { parseCsvLine } from "./csv";

describe("parseCsvLine", () => {
  it("splits plain fields", () => {
    expect(parseCsvLine("A,B,C")).toEqual(["A", "B", "C"]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsvLine('00000123,"SAMPLE, OWNER",1978')).toEqual(["00000123", "SAMPLE, OWNER", "1978"]);
  });

  it("turns a doubled quote inside a quoted field into one quote", () => {
    expect(parseCsvLine('"SAY ""HI""",X')).toEqual(['SAY "HI"', "X"]);
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(parseCsvLine("A,,C,")).toEqual(["A", "", "C", ""]);
  });

  it("returns a single empty field for an empty line", () => {
    expect(parseCsvLine("")).toEqual([""]);
  });
});
