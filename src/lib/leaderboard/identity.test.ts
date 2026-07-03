// src/lib/leaderboard/identity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normEmail, normName, normPhone } from "./identity.ts";

test("normEmail lowercases + trims", () => {
  assert.equal(normEmail("  Alan.Bieberle@MillerStorm.com "), "alan.bieberle@millerstorm.com");
  assert.equal(normEmail(undefined), "");
});

test("normName lowercases, trims, collapses whitespace", () => {
  assert.equal(normName("  Fernando   Cano "), "fernando cano");
  assert.equal(normName(""), "");
});

test("normPhone reduces to 10 digits, drops US country code", () => {
  assert.equal(normPhone("(817) 897-6947"), "8178976947");
  assert.equal(normPhone("+1 817-897-6947"), "8178976947");
  assert.equal(normPhone("18178976947"), "8178976947");
  assert.equal(normPhone("12345"), "");        // too short -> unusable
  assert.equal(normPhone(undefined), "");
});
